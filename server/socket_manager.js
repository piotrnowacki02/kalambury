const { Server } = require("socket.io");
const db = require("./db");
const gameManager = require("./game_manager");

function setupSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log(`Nowe połączenie: ${socket.id}`);

        socket.on("joinRoom", async ({ playerId, roomId }) => {
            console.log(`Gracz ${playerId} dołącza do pokoju ${roomId}`);
            socket.join(roomId);

            const players = await db.getRoomPlayers(roomId);
            io.to(roomId).emit("updatePlayers", players);
        });

        socket.on("startGame", async (roomId) => {
            console.log(`Rozpoczynanie gry w pokoju ${roomId}`);
            await db.updateRoomStatus(roomId, true);
            const roundData = await gameManager.startNewRound(roomId);
            io.to(roomId).emit("gameStarted", roundData);
        });

        socket.on("sendGuess", async ({ roomId, playerId, guess }) => {
            const result = await gameManager.checkGuess(roomId, playerId, guess);
            if (result) {
                io.to(roomId).emit("correctGuess", { playerId, newRound: result });
            } else {
                io.to(roomId).emit("wrongGuess", { playerId, guess });
            }
        });

        socket.on("sendDrawing", (data) => {
            io.to(data.roomId).emit("receiveDrawing", data);
        });

        socket.on("disconnect", () => {
            console.log(`Rozłączono: ${socket.id}`);
        });
    });

    return io;
}

module.exports = { setupSocket };
