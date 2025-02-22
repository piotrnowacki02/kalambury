const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'my-secret-pw',
    database: 'test',
    connectionLimit: 10
});

async function getRooms() {
    const [rows] = await pool.query('SELECT * FROM rooms');
    return rows;
}

async function getRoom(id) {
    const [rows] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
    return rows[0];
}

async function createRoom(room) {
    const [result] = await pool.query('INSERT INTO rooms SET ?', room);
    return result.insertId;
}

async function getPlayer(id) {
    const [rows] = await pool.query('SELECT * FROM players WHERE id = ?', [id]);
    return rows[0];
}