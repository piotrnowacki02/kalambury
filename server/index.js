const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
var mustacheExpress = require('mustache-express');
const { createPool } = require('mysql2/promise');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

let playerId = null;
let roomId = null;
// stwórz tablice gdzie indeksy to id pokoju a wartości to tablica z wordIds
let roomWords = {};

const pool = createPool({
    host: 'localhost',
    user: 'root',
    password: 'my-secret-pw',
    database: 'kalambury',
    connectionLimit: 10
});

const SECRET_KEY = 'I love you dude. Let it rip';

const app = express();

app.engine('html', mustacheExpress());

app.set('view engine', 'html');
app.set('views', path.join(__dirname, '..', 'client_vanilla'));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per 15 minutes
    message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

const server = http.createServer(app);

const io = require('socket.io')(server, {
    cors: { origin: '*' }
});

let roomData = async (roomId) =>
{       
    try
    {
        const [results, _] = await pool.query('SELECT * FROM rooms WHERE room_id = ?', [roomId]);
        if(results.length > 0)
        {
            const room = results[0];
            console.log("udalo sie pobrac dane pokoju: ", room.room_id, room.playing, room.owner);
            return {id: room.room_id, playing: room.playing, owner: room.owner};
        }
        else
        {
            console.log("No room found with id: ${roomId}");
            return null;
        }
    }
    catch(error)
    {
        console.error('Error fetching room information:', error);
        return null;
    }
};

let playerData = async (playerId) =>
{
    try
    {
        const [results, _] = await pool.query('SELECT * FROM players p inner join rooms r on p.room_id = r.room_id WHERE player_id = ? AND p.room_id IS NOT NULL', [playerId]);
        if(results.length > 0)
        {
            const player = results[0];
            console.log("udalo sie pobrac dane gracza: ", player.player_id, player.name, player.room_id, player.team_id);
            return {id: player.player_id,name: player.name, room: player.room_id, team: player.team_id};
        }
        else
        {
            console.log("No player found with id: ${playerId}");
            return null;
        }
    }
    catch(error)
    {
        console.error('Error fetching player information:', error);
        return null;
    }
};

let updateWordinRoom = async (roomId) =>
{
    try
    {
        const [rows] = await pool.query('SELECT word, word_id FROM words');
        // Losowy wybór słowa z listy
        let randomIndex = Math.floor(Math.random() * rows.length);
        let word_index = rows[randomIndex].word_id;

        if (!roomWords[roomId]) {
            roomWords[roomId] = [];
        }

        // Sprawdź, czy słowo już było
        if (roomWords[roomId].includes(word_index)) {
            while (roomWords[roomId].includes(word_index)) {
                randomIndex = Math.floor(Math.random() * rows.length);
                word_index = rows[randomIndex].word_id;
            }
        }
        roomWords[roomId].push(word_index); // Dodaj id słowo do tablicy

        await pool.query('UPDATE rooms SET currWord_id = ? WHERE room_id = ?', [word_index, roomId]);
        const word_to_guess = rows[randomIndex].word; // Wylosowane słowo przygotuj do zwrócenia
        console.log('Word to guess inside a function:', word_to_guess);
        return word_to_guess;
    }
    catch(error)
    {
        console.error('Error updating word:', error);
        return null;
    }
}

let roomIdisNull = async (playerId) => {
    try {
        const [results, _] = await pool.query('SELECT 1 FROM players p inner join rooms r on p.room_id = r.room_id WHERE player_id = ? AND p.room_id IS NOT NULL', [playerId]);
        return results.length === 0;
    } catch (error) {
        console.error('Błąd podczas sprawdzania playerName:', error);
        return true; // Domyślnie zakładaj, że name jest null, jeśli wystąpi błąd.
    }
};

let playerNameIsNull = async (playerId) => {
    try {
        const [results, _] = await pool.query('SELECT 1 FROM players WHERE player_id = ? AND name IS NOT NULL', [playerId]);
        return results.length === 0;
    } catch (error) {
        console.error('Błąd podczas sprawdzania playerName:', error);
        return true; // Domyślnie zakładaj, że name jest null, jeśli wystąpi błąd.
    }
};

const setPlayerId = async (res) => {
    const [results, _] = await pool.query('INSERT INTO players(name, team_id, room_id) VALUES (NULL, NULL, NULL)');
    console.log("inserted: ", results.insertId);
    playerId = results.insertId;
    const token = jwt.sign({ value: results.insertId }, SECRET_KEY, { expiresIn: '1h' });
    res.cookie('playerId', token, { httpOnly: false, secure: false });
};

app.use(async (req, res, next) => {
    console.log("GET/");
    if (!req.cookies.playerId) {
        await setPlayerId(res);
    } else {
        try {
            const decoded = jwt.verify(req.cookies.playerId, SECRET_KEY);
            console.log("decoded:", decoded.value);
            playerId = decoded.value;
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                await setPlayerId(res);
            } else {
                return res.status(403).send('Invalid token');
            }
        }
    }

    // Zapobieganie przekierowaniu pętli: nie przekierowuj, jeśli już jesteśmy na /name lub /submit-name
    if (req.originalUrl == '/') {
        if (await playerNameIsNull(playerId)) {
            console.log("redirecting to /name");
            return res.redirect('/name');
        }
        if(await roomIdisNull(playerId))
        {
            console.log("redirecting to /roomSelect");
            return res.redirect('/roomSelect');
        }

        const player = await playerData(playerId);
        const room = await roomData(player.room);
        if(room.playing == false)
        {
            return res.render('room', {roomId: room.id});
        }
        // GET/ - main page  index.html 
        const [team1Players] = await pool.query('SELECT player_id, name FROM players WHERE room_id = ? AND team_id = 1', [player.room]);
        const [team2Players] = await pool.query('SELECT player_id, name FROM players WHERE room_id = ? AND team_id = 2', [player.room]);

        const [currPlayer_id] = await pool.query('SELECT currPlayer_id FROM rooms WHERE room_id = ?', [player.room]);

        const [team1Score] = await pool.query('SELECT team1_score FROM rooms WHERE room_id = ?', [player.room]);
        const [team2Score] = await pool.query('SELECT team2_score FROM rooms WHERE room_id = ?', [player.room]);

        const [rows] = await pool.query('SELECT word FROM words join rooms on words.word_id = rooms.currWord_id WHERE room_id = ?', [player.room]);
        rows[0] == null ? word_to_guess = '' : word_to_guess = rows[0].word;
        console.log("word_to_guess: ", word_to_guess);

        const [rowTime] = await pool.query('SELECT currRound_timestamp FROM rooms WHERE room_id = ?', [player.room]);
        // Calculate remaining time
        const [timeForOneRoundRows] = await pool.query('SELECT roundTime FROM rooms WHERE room_id = ?', [player.room]);
        const timeForOneRound = timeForOneRoundRows[0].roundTime; 
        const currTime = new Date();
        const roundTime = new Date(rowTime[0].currRound_timestamp);
        const timeDiff = currTime - roundTime;
        const [roundNumber] = await pool.query('SELECT round FROM rooms WHERE room_id = ?', [player.room]);
        let remainingTime;
        if(roundNumber[0].round == 0)
        {
            remainingTime = 10 - Math.floor(timeDiff / 1000);
        }
        else
        {
            remainingTime = timeForOneRound - Math.floor(timeDiff / 1000);
        }
            


        // add isDrawing field to each player in each team
        team1Players.forEach(player => player.isDrawing = player.player_id === currPlayer_id[0].currPlayer_id);
        team2Players.forEach(player => player.isDrawing = player.player_id === currPlayer_id[0].currPlayer_id);

        const canvasData = roomCanvases[player.room] || '';
        console.log("remainingTime: ", remainingTime);
        return res.render('index', {
            team1: team1Players,
            team2: team2Players,
            team1Score: team1Score[0].team1_score,
            team2Score: team2Score[0].team2_score,
            playerId: player.id,
            currPlayerId: currPlayer_id[0].currPlayer_id,
            canvasData: canvasData,
            word_to_guess: word_to_guess,
            remainingTime: remainingTime
        });
    }



    next();
});

app.get('/name', (req, res) => {
    // if(!req.cookies.playerId)
    // {
    //     return res.redirect('/');
    // }
    console.log("GET/name");
    res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'name.html'));// kiedyś zrób to mustachem res.render('name');
});

app.post('/submit-name', async (req, res) => {
    const playerName = req.body.name;

    try {
        const [results, _] = await pool.query('UPDATE players SET name = ? WHERE player_id = ?', [playerName, playerId]);
        res.redirect('/');
    } catch (error) {
        console.error('Błąd podczas zapisu do bazy danych:', error);
        res.status(500).send('Wystąpił błąd podczas zapisu do bazy danych.');
    }
});

app.get('/roomSelect', (req, res) => {
    // if(!req.cookies.playerId || playerNameIsNull(playerId))
    // {
    //     return res.redirect('/');
    // }
    console.log("GET/roomSelect");
    res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'roomSelect.html'));
});

app.get('/room-create', async (req, res) => {
    // if(!req.cookies.playerId || playerNameIsNull(playerId))
    // {
    //     return res.redirect('/');
    // }
    console.log("GET/room-create");
    try {
        console.log("room create sql start")
        roomWords[roomId] = [];
        const [results, _] = await pool.query('INSERT INTO rooms (room_id, playing, owner) VALUES (NULL, FALSE, ? );', [playerId]);
        roomId = results.insertId;
        console.log("room_id: ", roomId);
        const [results2, _2] = await pool.query('UPDATE players SET room_id = ? WHERE player_id = ?', [roomId, playerId]);
        const [results3, _3] = await pool.query('SELECT name from players where room_id = ?', [roomId]);
        res.render('room', {roomId: roomId, players: results3});
    }
    catch (error) {
        console.error('Błąd podczas tworzenia pokoju:', error);
        res.status(500).send('Wystąpił błąd podczas tworzenia pokoju.');
    }
});

app.post('/room-join', async (req, res) => {
    // if(!req.cookies.playerId || playerNameIsNull(playerId))
    // {
    //     return res.redirect('/');
    // }
    console.log("POST/room-join", req.body['room-id']);
    try {
        const [results2, _2] = await pool.query('UPDATE players SET room_id = ? WHERE player_id = ?', [req.body['room-id'], playerId]);
        const [results3, _3] = await pool.query('SELECT name from players where room_id = ?', [req.body['room-id']]);
        res.render('room', {roomId: req.body['room-id'], players: results3});
    }
    catch (error) {
        console.error('Błąd podczas tworzenia pokoju:', error);
        res.status(500).send('Wystąpił błąd podczas tworzenia pokoju.');
    }
});

app.post('/start-game', async (req, res) => {
    console.log("POST/start-game", req.body.roomId);
    try {
        const roomId = req.body.roomId;
        await pool.query('UPDATE rooms SET playing = TRUE WHERE room_id = ?', [roomId]);
        io.to(roomId).emit('lets-play');
        res.status(200).send('Game started');
    } catch (error) {
        console.error('Błąd podczas rozpoczęcia gry:', error);
        res.status(500).send('Wystąpił błąd podczas rozpoczęcia gry.');
    }
});

app.use(express.static(path.join(__dirname, '..', 'client_vanilla')));

// Mapa do przechowywania timerów dla każdego pokoju
const roomTimers = new Map();
const firstTimers = new Map(); // To track the first timer per room

function div(a, b) {
    return (Math.round(a / b - 0.5));
}

// Function to start the round timer
const startRoundTimer = (roomId, timerDuration = 60000) => {
    // If there is a previous timer for this room, cancel it
    if (roomTimers.has(roomId)) {
        clearTimeout(roomTimers.get(roomId));
    }

    // Determine the duration for the first timer (10 seconds for the first round)
    let duration = firstTimers.has(roomId) ? timerDuration : 10000; // 10 seconds for the first timer
    firstTimers.set(roomId, true);// maybe delete this line
    
    // Set up the round timer
    const timer = setTimeout(async () => {
        try {
            // Increment round in the database
            const [result] = await pool.query('UPDATE rooms SET round = round + 1 WHERE room_id = ?', [roomId]);
            console.log(`Round updated for room ${roomId}`);

            // Get the new round value
            const [roundResult] = await pool.query('SELECT round FROM rooms WHERE room_id = ?', [roomId]);
            if (roundResult[0].round % 2 == 0) { // Round for team 2
                let currPlayer_id_in_db = div(roundResult[0].round, 2);
                const [results, _] = await pool.query('SELECT player_id FROM players WHERE room_id = ? AND team_id = 2', [roomId]);
                let currPlayer_id = results[currPlayer_id_in_db % results.length].player_id;
                await pool.query('UPDATE rooms SET currPlayer_id = ? WHERE room_id = ?', [currPlayer_id, roomId]);
            } else { // Round for team 1
                let currPlayer_id_in_db = div(roundResult[0].round, 2);
                const [results, _] = await pool.query('SELECT player_id FROM players WHERE room_id = ? AND team_id = 1', [roomId]);
                let currPlayer_id = results[currPlayer_id_in_db % results.length].player_id;
                await pool.query('UPDATE rooms SET currPlayer_id = ? WHERE room_id = ?', [currPlayer_id, roomId]);
            }

            const [team1Players] = await pool.query('SELECT player_id, name FROM players WHERE room_id = ? AND team_id = 1', [roomId]);
            const [team2Players] = await pool.query('SELECT player_id, name FROM players WHERE room_id = ? AND team_id = 2', [roomId]);

            const [currPlayer_id] = await pool.query('SELECT currPlayer_id FROM rooms WHERE room_id = ?', [roomId]);

            // Add isDrawing field to each player in each team
            team1Players.forEach(player => player.isDrawing = player.player_id === currPlayer_id[0].currPlayer_id);
            team2Players.forEach(player => player.isDrawing = player.player_id === currPlayer_id[0].currPlayer_id);

            const [rows] = await pool.query('SELECT word, word_id FROM words');
            // Randomly select a word from the list
            let randomIndex = Math.floor(Math.random() * rows.length);
            let word_index = rows[randomIndex].word_id;

            if (!roomWords[roomId]) {
                roomWords[roomId] = [];
            }
            console.log("roomWords[", roomId, "]: ", roomWords[roomId]);

            // Check if the word has already been used
            if (roomWords[roomId].includes(word_index)) {
                while (roomWords[roomId].includes(word_index)) {
                    console.log("word_index: ", word_index);
                    randomIndex = Math.floor(Math.random() * rows.length);
                    word_index = rows[randomIndex].word_id;
                }
                console.log("word_index after loop: ", word_index);
            }

            console.log("word_index FINAL: ", word_index);
            roomWords[roomId].push(word_index); // Add the word ID to the array

            await pool.query('UPDATE rooms SET currWord_id = ? WHERE room_id = ?', [word_index, roomId]);
            const word_to_guess = rows[randomIndex].word; // Selected word to send to the client

            await pool.query('UPDATE rooms SET currRound_timestamp = NOW() WHERE room_id = ?', [roomId]);

            console.log('Word to guess:', word_to_guess);

            const [team1Score] = await pool.query('SELECT team1_score FROM rooms WHERE room_id = ?', [roomId]);
            const [team2Score] = await pool.query('SELECT team2_score FROM rooms WHERE room_id = ?', [roomId]);

            const [timeForOneRoundRows] = await pool.query('SELECT roundTime FROM rooms WHERE room_id = ?', [roomId]);

            duration = (timeForOneRoundRows[0].roundTime)*1000; // Set the duration to the normal round time

            // Send information about the new round to the players in the room
            console.log("remainingTime: ", duration / 1000);
            io.to(roomId).emit('new-round', { 
                team1: team1Players,
                team2: team2Players,
                currPlayerId: currPlayer_id,
                word_to_guess: word_to_guess,
                remainingTime: duration / 1000, // Send the remaining time in seconds
                team1Score: team1Score[0].team1_score,
                team2Score: team2Score[0].team2_score
            });

            io.to(roomId).emit("message", { clearCanvas: true });

            // Update the firstTimer flag so future timers use the normal duration
            if (!firstTimers.has(roomId)) {
                firstTimers.set(roomId, true); // First timer is now complete
            }

            // Start the next round timer
            startRoundTimer(roomId, timerDuration);
        } catch (error) {
            console.error(`Error updating round for room ${roomId}:`, error);
        }
    }, duration+1000); // +1s bo tak

    // Save the timer in the map
    roomTimers.set(roomId, timer);
};

let roomCanvases = {}; // To store canvas data for each room

// Emit canvas-state-request every 3 seconds to each room
setInterval(() => {
    const rooms = io.sockets.adapter.rooms;
    for (const room of rooms) {
        io.to(room[0]).emit('canvas-state-request');
    }
}, 3000);

io.on('connection', async (socket) => {
    console.log('a user connected');

    const cookieHeader = socket.handshake.headers.cookie || '';
    let playerIdToken;

    try {
        // Check if cookies are present
        if (!cookieHeader) {
            throw new Error('No cookies found');
        }

        // Split cookies and find playerId
        const cookies = cookieHeader.split('; ');
        const playerIdCookie = cookies.find(row => row.startsWith('playerId'));

        if (!playerIdCookie) {
            throw new Error('playerId cookie not found');
        }

        // Get the token from the playerId cookie
        playerIdToken = playerIdCookie.split('=')[1];

        // Verify JWT token
        const decoded = jwt.verify(playerIdToken, SECRET_KEY);
        const playerId = decoded.value;
        socket.playerId = playerId;
        let roomId;

        try {
            // Fetch room ID from the database
            const [results] = await pool.query('SELECT room_id FROM players WHERE player_id = ?', [playerId]);
            if (results.length > 0) {
                roomId = results[0].room_id;
            } else {
                throw new Error('Room ID not found for player');
            }
        } catch (error) {
            console.error('Error fetching room ID:', error);
            socket.emit('error', 'Could not fetch room ID');
            socket.disconnect();
            return;
        }

        if (roomId) {
            // Join the socket to the room
            socket.roomId = roomId;
            socket.join(roomId);
            console.log(`User with player ID ${playerId} joined room ${roomId}`);

            // Notify other players in the room
            const [players] = await pool.query('SELECT name FROM players WHERE room_id = ?', [roomId]);
            io.to(roomId).emit('player-joined', players);
        }
    } catch (err) {
        // Handle different types of errors
        if (err.name === 'TokenExpiredError') {
            socket.emit('token-expired');
        } else {
            console.error('Invalid token or error parsing cookies:', err.message);
            socket.emit('error', 'Invalid token or error parsing cookies');
        }
        socket.disconnect();
        return;
    }

    socket.on('message', (msg) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('message', msg);
        }
    });

    socket.on('start-game', async (roomId, roundTime, playerId_var) => {
        try {
            const [results] = await pool.query('Select count(*) from players where room_id = ?', [roomId]);
            if (results[0]['count(*)'] < 4) {
                console.log("Not enough players to start game");
                return;
            }
            const [results2] = await pool.query('Select owner from rooms where room_id = ?', [roomId]);
            if (results2[0].owner != playerId_var) {
                console.log("Only the owner can start the game");
                return;
            }
    
            const [playersToSort] = await pool.query('SELECT player_id FROM players WHERE room_id = ?', [roomId]);
            let round = 0;
            await pool.query('UPDATE rooms SET round = ? WHERE room_id = ?', [round, roomId]);
            await pool.query('UPDATE rooms SET playing = TRUE WHERE room_id = ?', [roomId]);
            await pool.query('UPDATE rooms SET roundTime = ? WHERE room_id = ?', [roundTime, roomId]);
            
            const shuffledPlayers = playersToSort.sort(() => Math.random() - 0.5); // Shuffle players and assign teams
            const half = Math.floor(playersToSort.length / 2);
            for (let i = 0; i < shuffledPlayers.length; i++) 
            {
                const team = i < half ? 1 : 2;
                await pool.query('UPDATE players SET team_id = ? WHERE player_id = ?', [team, shuffledPlayers[i].player_id]);
            }
    
            // select players from the room from team 1 and 2
            const [team1Players] = await pool.query('SELECT player_id FROM players WHERE room_id = ? AND team_id = 1', [roomId]);
            const [team2Players] = await pool.query('SELECT player_id FROM players WHERE room_id = ? AND team_id = 2', [roomId]);
    
            // check if there are any players in the result
            if (team1Players.length > 0) 
            {
                // get the first player from team 1
                const firstPlayer = team1Players[0]; // first element in the array
                console.log("firstPlayer", firstPlayer);
                await pool.query('UPDATE rooms SET currPlayer_id = ? WHERE room_id = ?', [firstPlayer.player_id, roomId]);
            } 
            else 
            {
                console.log("No players found in team 1 for room", roomId);
            }
            // set the current round timestamp to now
            await pool.query('UPDATE rooms SET currRound_timestamp = NOW() WHERE room_id = ?', [roomId]);

            // Redirect clients to the game page
            startRoundTimer(roomId, roundTime*1000);
            io.to(roomId).emit('lets-play');
            console.log(`Emitting 'lets-play' to room ${roomId}`);
        } catch (error) {
            console.error('Error starting game:', error);
        }
    });

    socket.on('canvas-state-update', (canvasData) => {
        const rooms = Array.from(socket.rooms);
        const room = rooms[1]; // Assuming room is the second item (first is socket id)
        if (room) {
            roomCanvases[room] = canvasData; // Store the canvas data for the room
        }
    });

    socket.on('award-point', async (playerId) => {
        console.log("playerId: ", playerId);
        const Player = await playerData(playerId.val);
        const [currPlayer_id] = await pool.query('SELECT currPlayer_id FROM rooms WHERE room_id = ?', [Player.room]);
        const [currPlayer_team] = await pool.query('SELECT team_id FROM players WHERE player_id = ?', [currPlayer_id[0].currPlayer_id]);
        console.log("currPlayer_team: ", currPlayer_team[0].team_id);
        if(Player.team != currPlayer_team[0].team_id)
        {
            if(Player.team == 1)
            {
                await pool.query('UPDATE rooms SET team2_score = team2_score + 1 WHERE room_id = ?', [Player.room]);
            }
            else
            {
                await pool.query('UPDATE rooms SET team1_score = team1_score + 1 WHERE room_id = ?', [Player.room]);
            }
            let word_to_guess = await updateWordinRoom(Player.room);
            // get players from the room
            const [team1Players] = await pool.query('SELECT player_id, name FROM players WHERE room_id = ? AND team_id = 1', [Player.room]);
            const [team2Players] = await pool.query('SELECT player_id, name FROM players WHERE room_id = ? AND team_id = 2', [Player.room]);
            const [currPlayer_id] = await pool.query('SELECT currPlayer_id FROM rooms WHERE room_id = ?', [Player.room]);
            const [team1Score] = await pool.query('SELECT team1_score FROM rooms WHERE room_id = ?', [Player.room]);
            const [team2Score] = await pool.query('SELECT team2_score FROM rooms WHERE room_id = ?', [Player.room]);

            // add isDrawing field to each player in each team
            team1Players.forEach(player => player.isDrawing = player.player_id === currPlayer_id[0].currPlayer_id);
            team2Players.forEach(player => player.isDrawing = player.player_id === currPlayer_id[0].currPlayer_id);
            console.log("word_to_guess ready to sent: ", word_to_guess);
            io.to(Player.room).emit('new-word', { 
                word_to_guess: word_to_guess,
                team1Score: team1Score[0].team1_score,
                team2Score: team2Score[0].team2_score,
                team1: team1Players,
                team2: team2Players,
                currPlayerId: currPlayer_id[0].currPlayer_id
            });
        }
    });
    
});

server.listen(8080, () => { console.log('listening to http://localhost:8080'); });
