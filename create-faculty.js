import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const [,, fullName, email, password] = process.argv;
if (!fullName || !email || !password || password.length < 8) {
  console.error('Usage: node db/create-faculty.js "Faculty Name" faculty@example.com StrongPassword');
  process.exit(1);
}
const pool = mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false'}:undefined});
try {
  const hash=await bcrypt.hash(password,12);
  await pool.execute('INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,"FACULTY")',[fullName,email.toLowerCase(),hash]);
  console.log('Faculty account created:',email.toLowerCase());
} catch(e) { console.error(e.code==='ER_DUP_ENTRY'?'Email already exists':e.message); process.exitCode=1; }
finally { await pool.end(); }
