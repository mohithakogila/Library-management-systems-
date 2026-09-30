import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const required = ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','JWT_SECRET'];
for (const key of required) if (!process.env[key]) console.warn(`Missing environment variable: ${key}`);

const app = express();
const PORT = Number(process.env.PORT || 5000);
const FEE = Number(process.env.LATE_FEE_PER_DAY || 5);
const MAX_LOAN_DAYS = Number(process.env.MAX_LOAN_DAYS || 14);
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  dateStrings: true
});

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));

function fail(message, status = 400) { const e = new Error(message); e.status = status; return e; }
function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role, name: user.full_name }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h', jwtid: crypto.randomUUID() }); }
function auth(req, _res, next) {
  try {
    const value = req.headers.authorization || '';
    if (!value.startsWith('Bearer ')) throw fail('Authentication required', 401);
    req.user = jwt.verify(value.slice(7), JWT_SECRET);
    next();
  } catch (e) { next(fail(e.status === 401 ? 'Invalid or expired token' : 'Authentication failed', 401)); }
}
function role(...roles) { return (req, _res, next) => roles.includes(req.user.role) ? next() : next(fail('You do not have permission for this action', 403)); }
function cleanEmail(v) { return String(v || '').trim().toLowerCase(); }
function cleanText(v, max = 200) { return String(v ?? '').trim().slice(0, max); }

app.get('/api/health', async (_req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'library-api', time: new Date().toISOString() }); }
  catch (e) { next(fail('Database unavailable', 503)); }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const fullName = cleanText(req.body.fullName, 100);
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || '');
    if (fullName.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) throw fail('Enter a valid name, email and password of at least 8 characters');
    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.execute('INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,"STUDENT")', [fullName, email, hash]);
    res.status(201).json({ id: r.insertId, message: 'Student account created. You can now log in.' });
  } catch (e) { next(e.code === 'ER_DUP_ENTRY' ? fail('Email is already registered', 409) : e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email); const password = String(req.body.password || '');
    if (!email || !password) throw fail('Email and password are required');
    const [rows] = await pool.execute('SELECT id,full_name,email,password_hash,role,is_active FROM users WHERE email=? LIMIT 1', [email]);
    if (!rows.length || !rows[0].is_active || !(await bcrypt.compare(password, rows[0].password_hash))) throw fail('Invalid email or password', 401);
    const u = rows[0]; res.json({ token: tokenFor(u), user: { id: u.id, name: u.full_name, email: u.email, role: u.role } });
  } catch (e) { next(e); }
});

app.get('/api/me', auth, async (req, res, next) => {
  try { const [r] = await pool.execute('SELECT id,full_name,email,role,created_at FROM users WHERE id=? AND is_active=1', [req.user.id]); if (!r.length) throw fail('Account not found',404); res.json(r[0]); } catch(e){ next(e); }
});

app.get('/api/books', auth, async (req, res, next) => {
  try {
    const q = cleanText(req.query.q, 100); const like = `%${q}%`;
    const [rows] = await pool.execute(`SELECT id,isbn,title,author,publisher,category,publication_year,total_copies,available_copies,description FROM books WHERE is_active=1 AND (title LIKE ? OR author LIKE ? OR category LIKE ? OR isbn LIKE ?) ORDER BY title`, [like,like,like,like]);
    res.json(rows);
  } catch(e){ next(e); }
});

app.post('/api/books', auth, role('FACULTY'), async (req,res,next)=>{
  try {
    const isbn=cleanText(req.body.isbn,30)||null, title=cleanText(req.body.title,200), author=cleanText(req.body.author,150), publisher=cleanText(req.body.publisher,150)||null, category=cleanText(req.body.category,100)||'General', description=cleanText(req.body.description,1000)||null;
    const total=Number(req.body.totalCopies), year=req.body.publicationYear ? Number(req.body.publicationYear) : null;
    if(title.length<2||author.length<2||!Number.isInteger(total)||total<1||total>100000) throw fail('Enter valid book details and number of copies');
    if(year!==null && (!Number.isInteger(year)||year<1000||year>new Date().getFullYear()+1)) throw fail('Invalid publication year');
    const [r]=await pool.execute('INSERT INTO books(isbn,title,author,publisher,category,publication_year,total_copies,available_copies,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',[isbn,title,author,publisher,category,year,total,total,description,req.user.id]);
    await pool.execute('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',[req.user.id,'BOOK_CREATED','BOOK',r.insertId,JSON.stringify({title,total})]);
    res.status(201).json({id:r.insertId,message:'Book added successfully'});
  }catch(e){next(e.code==='ER_DUP_ENTRY'?fail('ISBN already exists',409):e)}
});

app.put('/api/books/:id', auth, role('FACULTY'), async(req,res,next)=>{
  try{
    const id=Number(req.params.id); const total=Number(req.body.totalCopies);
    if(!Number.isInteger(id)||!Number.isInteger(total)||total<1) throw fail('Invalid book or copy count');
    const [[b]]=await pool.execute('SELECT total_copies,available_copies,title FROM books WHERE id=? AND is_active=1',[id]); if(!b) throw fail('Book not found',404);
    const issued=b.total_copies-b.available_copies; if(total<issued) throw fail(`Cannot set copies below ${issued} currently issued`);
    const available=total-issued;
    await pool.execute('UPDATE books SET total_copies=?,available_copies=? WHERE id=?',[total,available,id]);
    res.json({message:'Book inventory updated'});
  }catch(e){next(e)}
});

app.delete('/api/books/:id', auth, role('FACULTY'), async(req,res,next)=>{
  try{
    const id=Number(req.params.id); const [[b]]=await pool.execute('SELECT id,title FROM books WHERE id=? AND is_active=1',[id]); if(!b) throw fail('Book not found',404);
    const [[a]]=await pool.execute('SELECT COUNT(*) c FROM loans WHERE book_id=? AND status="ISSUED"',[id]); if(Number(a.c)>0) throw fail('Book has active loans and cannot be removed',409);
    await pool.execute('UPDATE books SET is_active=0 WHERE id=?',[id]);
    await pool.execute('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',[req.user.id,'BOOK_REMOVED','BOOK',id,JSON.stringify({title:b.title})]);
    res.json({message:'Book removed from the active catalogue'});
  }catch(e){next(e)}
});

app.post('/api/loans', auth, role('STUDENT'), async(req,res,next)=>{
  const bookId=Number(req.body.bookId), days=Math.min(Math.max(Number(req.body.days||MAX_LOAN_DAYS),1),MAX_LOAN_DAYS); const conn=await pool.getConnection();
  try{
    if(!Number.isInteger(bookId)) throw fail('Invalid book');
    await conn.beginTransaction();
    const [books]=await conn.execute('SELECT id,title,available_copies FROM books WHERE id=? AND is_active=1 FOR UPDATE',[bookId]); if(!books.length) throw fail('Book not found',404); if(books[0].available_copies<1) throw fail('No copies are currently available',409);
    const [existing]=await conn.execute('SELECT id FROM loans WHERE book_id=? AND student_id=? AND status="ISSUED"',[bookId,req.user.id]); if(existing.length) throw fail('You already have an active copy of this book',409);
    const [[active]] = await conn.execute('SELECT COUNT(*) c FROM loans WHERE student_id=? AND status="ISSUED"',[req.user.id]); if(Number(active.c)>=Number(process.env.MAX_ACTIVE_LOANS||5)) throw fail('You have reached the active-loan limit',409);
    await conn.execute('INSERT INTO loans(book_id,student_id,due_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL ? DAY))',[bookId,req.user.id,days]); await conn.execute('UPDATE books SET available_copies=available_copies-1 WHERE id=?',[bookId]);
    await conn.execute('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',[req.user.id,'BOOK_ISSUED','LOAN',null,JSON.stringify({bookId})]);
    await conn.commit(); res.status(201).json({message:'Book issued successfully',dueInDays:days});
  }catch(e){await conn.rollback();next(e)}finally{conn.release()}
});

app.get('/api/loans/my', auth, role('STUDENT'), async(req,res,next)=>{try{const [rows]=await pool.execute(`SELECT l.id,l.book_id,b.title,b.author,l.issued_at,l.due_at,l.returned_at,l.penalty,l.status FROM loans l JOIN books b ON b.id=l.book_id WHERE l.student_id=? ORDER BY l.issued_at DESC`,[req.user.id]);res.json(rows)}catch(e){next(e)}});

app.post('/api/loans/:id/return', auth, role('STUDENT'), async(req,res,next)=>{
  const conn=await pool.getConnection(); try{
    await conn.beginTransaction(); const [rows]=await conn.execute('SELECT * FROM loans WHERE id=? AND student_id=? AND status="ISSUED" FOR UPDATE',[Number(req.params.id),req.user.id]); if(!rows.length) throw fail('Active loan not found',404);
    const loan=rows[0]; const [[late]]=await conn.execute('SELECT GREATEST(DATEDIFF(CURDATE(),DATE(?)),0) daysLate',[loan.due_at]); const daysLate=Number(late.daysLate); const penalty=daysLate*FEE;
    await conn.execute('UPDATE loans SET returned_at=NOW(),penalty=?,status="RETURNED" WHERE id=?',[penalty,loan.id]); await conn.execute('UPDATE books SET available_copies=LEAST(total_copies,available_copies+1) WHERE id=?',[loan.book_id]);
    if(penalty>0) await conn.execute('INSERT INTO penalties(loan_id,student_id,amount,days_late) VALUES(?,?,?,?)',[loan.id,req.user.id,penalty,daysLate]);
    await conn.execute('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',[req.user.id,'BOOK_RETURNED','LOAN',loan.id,JSON.stringify({bookId:loan.book_id,daysLate,penalty})]);
    await conn.commit(); res.json({message:'Book returned successfully',daysLate,penalty});
  }catch(e){await conn.rollback();next(e)}finally{conn.release()}
});

app.get('/api/analytics/student', auth, role('STUDENT'), async(req,res,next)=>{try{const [[s]]=await pool.execute(`SELECT COUNT(*) totalLoans,SUM(status='ISSUED') activeLoans,COALESCE(SUM(penalty),0) totalPenalty FROM loans WHERE student_id=?`,[req.user.id]);const [[o]]=await pool.execute(`SELECT COUNT(*) overdue FROM loans WHERE student_id=? AND status='ISSUED' AND due_at<NOW()`,[req.user.id]);res.json({...s,overdue:Number(o.overdue)})}catch(e){next(e)}});

app.get('/api/analytics', auth, role('FACULTY'), async(_req,res,next)=>{try{
  const [[books]]=await pool.query('SELECT COUNT(*) totalTitles,COALESCE(SUM(total_copies),0) totalCopies,COALESCE(SUM(available_copies),0) availableCopies,COALESCE(SUM(total_copies-available_copies),0) issuedCopies FROM books WHERE is_active=1');
  const [[loans]]=await pool.query('SELECT COUNT(*) totalLoans,SUM(status="ISSUED") activeLoans,SUM(status="RETURNED") returnedLoans,COALESCE(SUM(penalty),0) penalties,COALESCE(SUM(penalty>0),0) lateReturns FROM loans');
  const [popular]=await pool.query(`SELECT b.title,b.author,COUNT(l.id) issueCount FROM books b LEFT JOIN loans l ON l.book_id=b.id WHERE b.is_active=1 GROUP BY b.id ORDER BY issueCount DESC,b.title LIMIT 10`);
  const [categories]=await pool.query(`SELECT COALESCE(category,'Uncategorized') category,COUNT(*) titles,COALESCE(SUM(total_copies),0) copies,COALESCE(SUM(total_copies-available_copies),0) issued FROM books WHERE is_active=1 GROUP BY category ORDER BY copies DESC`);
  const [monthly]=await pool.query(`SELECT DATE_FORMAT(issued_at,'%Y-%m') month,COUNT(*) issues FROM loans WHERE issued_at>=DATE_SUB(CURDATE(),INTERVAL 5 MONTH) GROUP BY month ORDER BY month`);
  res.json({books,loans,popular,categories,monthly});
}catch(e){next(e)}});

app.get('/api/admin/audit', auth, role('FACULTY'), async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,u.full_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100`);res.json(rows)}catch(e){next(e)}});

app.use((err,_req,res,_next)=>{console.error(err);const status=Number(err.status)||500;res.status(status).json({message:status===500?'An unexpected server error occurred':err.message})});
app.listen(PORT,()=>console.log(`Library API listening on port ${PORT}`));
