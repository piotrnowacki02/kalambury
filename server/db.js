const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'my-secret-pw',
    database: 'kalambury',
    connectionLimit: 10
});

async function getRooms() {
    const [rows] = await pool.query('SELECT * FROM rooms');
    return rows;
}

async function getRoom(id) {
    const [rows] = await pool.query('SELECT * FROM rooms WHERE room_id = ?', [id]);
    return rows[0];
}

async function createRoom(room) {
    const [result] = await pool.query('INSERT INTO rooms SET ?', room);
    return result.insertId;
}

async function getPlayer(id) {
    const [rows] = await pool.query('SELECT * FROM players WHERE player_id = ?', [id]);
    return rows[0];
}

async function updateWordInRoom(roomId) {
    try {
        const [rows] = await pool.query('SELECT word, word_id FROM words');
        let randomIndex = Math.floor(Math.random() * rows.length);
        let word_index = rows[randomIndex].word_id;

        await pool.query('UPDATE rooms SET currWord_id = ? WHERE room_id = ?', [word_index, roomId]);
        return rows[randomIndex].word;
    } catch (error) {
        console.error('Error updating word:', error);
        return null;
    }
}

async function playerNameIsNull(playerId) {
    try {
        const [results] = await pool.query('SELECT 1 FROM players WHERE player_id = ? AND name IS NOT NULL', [playerId]);
        return results.length === 0;
    } catch (error) {
        console.error('Error checking player name:', error);
        return true;
    }
}

async function roomIdIsNull(playerId) {
    try {
        const [results] = await pool.query('SELECT 1 FROM players p INNER JOIN rooms r ON p.room_id = r.room_id WHERE player_id = ? AND p.room_id IS NOT NULL', [playerId]);
        return results.length === 0;
    } catch (error) {
        console.error('Error checking room ID:', error);
        return true;
    }
}

async function insertNewPlayer() {
    try {
        const [result] = await pool.query('INSERT INTO players SET ?', { name: null, room_id: null });
        return result.insertId;
    } catch (error) {
        console.error('Error inserting new player:', error);
        return null;
    }
}

async function setPlayerName(playerId, name) {
    try {
        await pool.query('UPDATE players SET name = ? WHERE player_id = ?', [name, playerId]);
    } catch (error) {
        console.error('Error setting player name:', error);
    }
}

async function playerJoinRoom(playerId, roomId) {
    try {
        await pool.query('UPDATE players SET room_id = ? WHERE player_id = ?', [roomId, playerId]);
    } catch (error) {
        console.error('Error joining room:', error);
    }
}

async function getRoomPlayers(roomId) {
    const [rows] = await pool.query('SELECT * FROM players WHERE room_id = ?', [roomId]);
    return rows;
}

module.exports = {
    getRooms,
    getRoom,
    createRoom,
    getPlayer,
    updateWordInRoom,
    playerNameIsNull,
    roomIdIsNull,
    insertNewPlayer,
    setPlayerName,
    playerJoinRoom,
    getRoomPlayers
};
