const cookieManager = require('./cookieManager');
const db = require('./db');

async function playerMiddleware(req, res, next) {
    console.log("Middleware: Checking player session");

    let playerId = cookieManager.getPlayerIdFromCookies(req, res);
    if (!playerId) {
        playerId = await db.insertNewPlayer();
        cookieManager.setPlayerCookie(res, playerId);
    }

    if (await db.playerNameIsNull(playerId) && req.url !== '/name') {
        console.log("Redirecting to /name");
        return res.redirect('/name');
    }

    if (await db.roomIdIsNull(playerId) && req.url !== '/roomSelect' && req.url !== '/room-create' && req.url !== '/room-join') {
        console.log("Redirecting to /roomSelect");
        return res.redirect('/roomSelect');
    }

    const player = await db.playerData(playerId);
    const room = await db.roomData(player.room_id);

    if (!room.playing) {
        return res.render('room', { roomId: room.id });
    }

    next();
}

module.exports = { playerMiddleware };
    