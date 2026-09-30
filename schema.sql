CREATE DATABASE IF NOT EXISTS library_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE library_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('STUDENT','FACULTY') NOT NULL DEFAULT 'STUDENT',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role(role), INDEX idx_users_active(is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  isbn VARCHAR(30) NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  author VARCHAR(150) NOT NULL,
  publisher VARCHAR(150) NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  publication_year SMALLINT NULL,
  total_copies INT NOT NULL DEFAULT 1,
  available_copies INT NOT NULL DEFAULT 1,
  description VARCHAR(1000) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_book_copies CHECK(total_copies >= 1 AND available_copies >= 0 AND available_copies <= total_copies),
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_books_search(title,author,category), INDEX idx_books_active(is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  book_id INT NOT NULL,
  student_id INT NOT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME NOT NULL,
  returned_at DATETIME NULL,
  penalty DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('ISSUED','RETURNED') NOT NULL DEFAULT 'ISSUED',
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(student_id) REFERENCES users(id),
  INDEX idx_loans_student_status(student_id,status), INDEX idx_loans_book_status(book_id,status), INDEX idx_loans_due(due_at,status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS penalties (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  loan_id BIGINT NOT NULL UNIQUE,
  student_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  days_late INT NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES users(id),
  INDEX idx_penalty_student(student_id,paid)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created(created_at), INDEX idx_audit_user(user_id)
) ENGINE=InnoDB;
