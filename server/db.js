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

async function createRoom(playerId) {
    const [result] = await pool.query('INSERT INTO rooms (room_id, playing, owner) VALUES (NULL, FALSE, ?)', [playerId]);
    return result.insertId;
}

async function getPlayer(id) {
    const [rows] = await pool.query('SELECT * FROM players WHERE player_id = ?', [id]);
    return rows[0];
}

async function updateWordInRoom(roomId) {
    try {
        // Pobranie ID słów, które już były użyte w danym pokoju
        const [usedWords] = await pool.query(
            'SELECT word_id FROM wordsUsedInRooms WHERE room_id = ?', 
            [roomId]
        );
        const usedWordIds = usedWords.map(row => row.word_id);

        // Pobranie wszystkich dostępnych słów
        const [allWords] = await pool.query('SELECT word, word_id FROM words');

        // Filtrowanie, aby usunąć już użyte słowa
        let availableWords = allWords.filter(word => !usedWordIds.includes(word.word_id));

        // Jeśli wszystkie słowa były już użyte, resetujemy listę
        if (availableWords.length === 0) {
            console.warn(`Wszystkie słowa zostały użyte w pokoju ${roomId}, resetowanie listy...`);
            await pool.query('DELETE FROM wordsUsedInRooms WHERE room_id = ?', [roomId]);
            availableWords = allWords; // Teraz znowu można użyć wszystkich słów
        }

        // Losowanie nowego słowa
        const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];

        // Aktualizacja w bazie danych: ustawienie nowego słowa w pokoju
        await pool.query('UPDATE rooms SET currWord_id = ? WHERE room_id = ?', [randomWord.word_id, roomId]);

        // Dodanie tego słowa do tabeli użytych słów
        await pool.query('INSERT INTO wordsUsedInRooms (room_id, word_id) VALUES (?, ?)', [roomId, randomWord.word_id]);

        console.log(`Nowe słowo dla pokoju ${roomId}: ${randomWord.word}`);
        return randomWord.word;
    } catch (error) {
        console.error('Błąd podczas aktualizacji słowa:', error);
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

async function updateRoomRoundData(roomId, newDrawingPlayer, currentRound, roundTimestamp
) {
    try {
        await pool.query('UPDATE rooms SET drawingPlayer = ?, currentRound = ?, roundTimestamp = ? WHERE room_id = ?', [newDrawingPlayer, currentRound, roundTimestamp, roomId]);
    } catch (error) {
        console.error(`Error updating room ${roomId} round data:`, error);
    }
}

async function getCurrentWord(roomId) {
    const [rows] = await pool.query('SELECT word FROM words w INNER JOIN rooms r ON w.word_id = r.currWord_id WHERE room_id = ?', [roomId]);
    return rows[0].word;
}

async function getPlayerTeam(playerId) {
    const [rows] = await pool.query('SELECT team FROM players WHERE player_id = ?', [playerId]);
    return rows[0].team;
}

async function updateTeamScore(roomId, teamNumber, newScore) {
    try {
        await pool.query(`UPDATE rooms SET team${teamNumber}Score = ? WHERE room_id = ?`, [newScore, roomId]);
    } catch (error) {
        console.error(`Error updating team ${teamNumber} score in room ${roomId}:`, error);
    }
}

async function updateRoomStatus(roomId, playing) {
    try {
        await pool.query('UPDATE rooms SET playing = ? WHERE room_id = ?', [playing, roomId]);
    } catch (error) {
        console.error(`Error updating room ${roomId} status:`, error);
    }
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
    getRoomPlayers,
    updateRoomRoundData,
    getCurrentWord,
    getPlayerTeam,
    updateTeamScore,
    updateRoomStatus
};
