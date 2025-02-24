const express = require('express');
const db = require('./db.js'); // Import funkcji związanych z bazą danych
const cookieManager = require('./cookie_manager.js'); // Import zarządzania cookie

const router = express.Router();

router.get('/', async (req, res) => {
    console.log("GET /");

    let playerId = cookieManager.getPlayerIdFromCookies(req, res);

    const player = await db.getPlayer(playerId);
    const room = await db.getRoom(player.room_id);

    if (!room.playing) {
        return res.render('room', { roomId: room.id });
    }

    const team1Players = await db.getTeamPlayers(player.room_id, 1);
    const team2Players = await db.getTeamPlayers(player.room_id, 2);
    const currPlayerId = room.currPlayerId;
    const team1Score = room.team1Score;
    const team2Score = room.team2Score;
    const wordToGuess = await db.getCurrentWord(player.room_id);
    const roundTimestamp = room.currRound_timestamp;
    const roundTime = room.roundTime;
    const roundNumber = room.round;

    const currTime = new Date();
    const roundStartTime = new Date(roundTimestamp);
    const timeDiff = currTime - roundStartTime;
    let remainingTime = roundNumber === 0 ? 10 - Math.floor(timeDiff / 1000) : roundTime - Math.floor(timeDiff / 1000);

    team1Players.forEach(player => player.isDrawing = player.player_id === currPlayerId);
    team2Players.forEach(player => player.isDrawing = player.player_id === currPlayerId);

    const canvasData = await db.getCanvasData(player.room_id);
    const color = await db.getRoomColor(player.room_id);
    const strokeWidth = await db.getRoomStrokeWidth(player.room_id);

    return res.render('index', {
        team1: team1Players,
        team2: team2Players,
        team1Score: team1Score,
        team2Score: team2Score,
        playerId: player.id,
        currPlayerId: currPlayerId,
        canvasData: JSON.stringify(canvasData),
        word_to_guess: wordToGuess,
        remainingTime: remainingTime,
        color: color,
        strokeWidth: strokeWidth
    });
});

router.get('/name', (req, res) => {
    console.log("GET /name");
    res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'name.html'));
});

router.post('/submit-name', async (req, res) => {
    const playerId = cookieManager.getPlayerIdFromCookies(req, res);
    const playerName = req.body.name;

    try {
        await db.setPlayerName(playerId, playerName);
        res.redirect('/');
    } catch (error) {
        console.error('Error saving name:', error);
        res.status(500).send('Database error.');
    }
});

router.get('/roomSelect', (req, res) => {
    console.log("GET /roomSelect");
    res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'roomSelect.html'));
});

router.get('/room-create', async (req, res) => {
    const playerId = cookieManager.getPlayerIdFromCookies(req, res);
    
    try {
        const roomId = await db.createRoom(playerId);
        res.render('room', { roomId, players: await db.getRoomPlayers(roomId) });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).send('Error creating room.');
    }
});

router.post('/room-join', async (req, res) => {
    const playerId = cookieManager.getPlayerIdFromCookies(req, res);
    const roomId = req.body['room-id'];

    try {
        await db.playerJoinRoom(playerId, roomId);
        res.render('room', { roomId, players: await db.getRoomPlayers(roomId) });
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).send('Error joining room.');
    }
});

module.exports = router;
