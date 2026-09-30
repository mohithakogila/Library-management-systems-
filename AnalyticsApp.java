package com.library.jdbc;

import java.sql.*;

public class AnalyticsApp {
    static String env(String key, String fallback) { return System.getenv().getOrDefault(key, fallback); }
    static Connection connection() throws SQLException {
        String url = "jdbc:mysql://" + env("DB_HOST","localhost") + ":" + env("DB_PORT","3306") + "/" + env("DB_NAME","library_db") + "?useSSL=" + env("DB_SSL","true") + "&serverTimezone=UTC";
        return DriverManager.getConnection(url, env("DB_USER","root"), env("DB_PASSWORD",""));
    }
    public static void main(String[] args) {
        try (Connection c = connection()) {
            System.out.println("=== LIBRARY ANALYTICS (JDBC) ===");
            summary(c); popular(c); categories(c); monthly(c);
        } catch (SQLException e) { System.err.println("Database error: " + e.getMessage()); System.exit(1); }
    }
    static void summary(Connection c) throws SQLException {
        String sql="SELECT COUNT(*) titles,COALESCE(SUM(total_copies),0) copies,COALESCE(SUM(available_copies),0) available FROM books WHERE is_active=1";
        try(PreparedStatement p=c.prepareStatement(sql);ResultSet r=p.executeQuery()){if(r.next())System.out.printf("Titles: %d | Copies: %d | Available: %d%n",r.getInt("titles"),r.getInt("copies"),r.getInt("available"));}
    }
    static void popular(Connection c) throws SQLException {
        String sql="SELECT b.title,COUNT(l.id) issues FROM books b LEFT JOIN loans l ON l.book_id=b.id WHERE b.is_active=1 GROUP BY b.id ORDER BY issues DESC,b.title LIMIT 10";
        System.out.println("\nMost issued books:");
        try(PreparedStatement p=c.prepareStatement(sql);ResultSet r=p.executeQuery()){while(r.next())System.out.printf("%-45s %d issues%n",r.getString("title"),r.getInt("issues"));}
    }
    static void categories(Connection c) throws SQLException {
        String sql="SELECT COALESCE(category,'General') category,COUNT(*) titles,COALESCE(SUM(total_copies),0) copies FROM books WHERE is_active=1 GROUP BY category ORDER BY copies DESC";
        System.out.println("\nCategories:");
        try(PreparedStatement p=c.prepareStatement(sql);ResultSet r=p.executeQuery()){while(r.next())System.out.printf("%-25s titles=%d copies=%d%n",r.getString("category"),r.getInt("titles"),r.getInt("copies"));}
    }
    static void monthly(Connection c) throws SQLException {
        String sql="SELECT DATE_FORMAT(issued_at,'%Y-%m') month,COUNT(*) issues FROM loans WHERE issued_at>=DATE_SUB(CURDATE(),INTERVAL 5 MONTH) GROUP BY month ORDER BY month";
        System.out.println("\nMonthly issues:");
        try(PreparedStatement p=c.prepareStatement(sql);ResultSet r=p.executeQuery()){while(r.next())System.out.printf("%s -> %d%n",r.getString("month"),r.getInt("issues"));}
    }
}
