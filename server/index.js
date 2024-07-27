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

const pool = createPool({
    host: 'localhost',
    user: 'root',
    password: '',
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
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per 15 minutes
    message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

const server = http.createServer(app);

const io = require('socket.io')(server, {
    cors: { origin: '*' }
});

let playerData = async (playerId) =>
{
    try
    {
        const [results, _] = await pool.query('SELECT 1 FROM players p inner join rooms r on p.room_id = r.room_id WHERE player_id = ? AND p.room_id IS NOT NULL', [playerId]);
        if(results.length > 0)
        {
            const player = results[0];
            return {id: player.player_id,name: player.name, room: player.room_id, group: player.group_id};
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
    res.cookie('playerId', token, { httpOnly: true, secure: false });
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
    }



    next();
});

app.get('/name', (req, res) => {
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
    console.log("GET/roomSelect");
    res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'roomSelect.html'));
});

app.get('/room-create', async (req, res) => {

    console.log("GET/room-create");
    try {
        console.log("room create sql start")
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


io.on('connection', async (socket) => {
    console.log('a user connected');

    const cookies = socket.handshake.headers.cookie;
    const playerIdToken = cookies.split('; ').find(row => row.startsWith('playerId')).split('=')[1];
    try {
        const decoded = jwt.verify(playerIdToken, SECRET_KEY);
        const playerId = decoded.value;
        let roomId;

        try {
            const [results] = await pool.query('SELECT room_id FROM players WHERE player_id = ?', [playerId]);
            if (results.length > 0) {
                roomId = results[0].room_id;
            }
        } catch (error) {
            console.error('Error fetching room ID:', error);
        }
        
        if (roomId) {
            socket.join(roomId);
            console.log(`User with player ID ${playerId} joined room ${roomId}`);

            const [players] = await pool.query('Select name from players where room_id = ?', [roomId]);
            io.to(roomId).emit('player-joined', players);
        }
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            socket.emit('token-expired');
        } else {
            console.error('Invalid token:', err);
            socket.disconnect();
        }
    }

    socket.on('message', (msg) => {
        if (roomId) {
            socket.to(roomId).emit('message', msg);
        }
    });

    socket.on('start-game', async (roomId) => {
        try {
            await pool.query('UPDATE rooms SET playing = TRUE WHERE room_id = ?', [roomId]);
            console.log(`Emitting 'lets-play' to room ${roomId}`);
            io.to(roomId).emit('lets-play');
            console.log(`'lets-play' event emitted to room ${roomId}`);
        } catch (error) {
            console.error('Error starting game:', error);
        }
    });
});

server.listen(8080, () => { console.log('listening to http://localhost:8080'); });
