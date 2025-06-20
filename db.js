const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',          // your MySQL host
  user: 'root',               // your MySQL username
  password: 'Cockp!t147',     // your MySQL password
  database: 'chat_app',       // your database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection pool on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL connected successfully');
    connection.release();
  } catch (err) {
    console.error('MySQL connection failed:', err);
    process.exit(1);  // Exit app if DB connection fails
  }
})();

// Helper function for queries with error handling
// Returns the rows array directly
async function query(sql, params) {
  try {
    const [results] = await pool.query(sql, params);
    return results;  // results is an array of rows
  } catch (err) {
    console.error('DB query error:', err);
    throw err;
  }
}

module.exports = {
  pool,
  query,
};
