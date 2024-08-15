let isPainting = false;
let lineWidth = 5;
let strokeStyle = "#cad3f4";

const ctx = canvas.getContext("2d");
let outgoing_buffer = [];
const START_OF_BUFFER = 0;

const isCurrentDrawingPlayer = currPlayerId === playerId;

const socket = io("ws://localhost:8080");
socket.on("message", (incoming_buffer) => {
  if ("color" in incoming_buffer) {
    strokeStyle = incoming_buffer.color;
    strokeColorInput.value = strokeStyle;
    return;
  }
  if ("lineWidth" in incoming_buffer) {
    lineWidth = incoming_buffer.lineWidth;
    lineWidthInput.value = lineWidth;
    return;
  }
  if ("clearCanvas" in incoming_buffer) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  console.log("incoming_buffer", incoming_buffer.length);
  for (const msg of incoming_buffer) {
    if (msg === START_OF_BUFFER) {
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.strokeStyle = strokeStyle;
      ctx.fillStyle = strokeStyle;
      ctx.beginPath();
      ctx.arc(msg["x"], msg["y"], lineWidth * 0.01, 0, 2*Math.PI)
      ctx.stroke();
      ctx.moveTo(msg["x"], msg["y"]);
    } else {
      const ctx = canvas.getContext("2d");
      ctx.lineTo(msg["x"], msg["y"]);
      ctx.stroke();
    }
  }
});



canvas.width = window.innerWidth - canvas.offsetLeft;
canvas.height = window.innerHeight - canvas.offsetTop;

const canvasOffsetX = canvas.offsetLeft;
const canvasOffsetY = canvas.offsetTop;


const startDrawing = (e) => {
  if (e.button === 0) {
    // Sprawdź, czy to lewy przycisk myszy
    isPainting = true;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = strokeStyle;
    ctx.fillStyle = strokeStyle;
    ctx.beginPath();
    ctx.arc(e.clientX - canvasOffsetX, e.clientY - canvasOffsetY, lineWidth * 0.01, 0, 2*Math.PI)
    // ctx.fill();
    ctx.stroke();
    ctx.moveTo(e.clientX - canvasOffsetX, e.clientY - canvasOffsetY); // x_0, y_0
    //socket.emit('message', { type: 0, x: (e.clientX - canvasOffsetX), y: (e.clientY - canvasOffsetY) });
    outgoing_buffer.push(START_OF_BUFFER);
    outgoing_buffer.push({ x: e.clientX - canvasOffsetX, y: e.clientY - canvasOffsetY }); // x_0
  }
};

const draw = (e) => {
  if (!isPainting) return;
  ctx.lineTo(e.clientX - canvasOffsetX, e.clientY - canvasOffsetY); // x_k, y_k
  ctx.stroke();
  outgoing_buffer.push({ x: e.clientX - canvasOffsetX, y: e.clientY - canvasOffsetY }); // x_k
};

const sendBuffer = () => {
  console.log("outgoing buffer", outgoing_buffer.length);
  socket.emit("message", outgoing_buffer);
  outgoing_buffer = [];
};

const timer = setInterval(() => {
  if (isPainting) sendBuffer();
}, 1000 / 20);

const stopDrawing = (e) => {
  if (isPainting && e.button === 0) {
    // Dodano warunek sprawdzający czy isPainting jest true
    isPainting = false;
    // buffer.push(END_OF_BUFFER);
    sendBuffer();
  }
};

canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseleave", stopDrawing);
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Zablokuj domyślne menu kontekstowe
});

clearButton.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit("message", { clearCanvas: true });
});

lineWidthInput.addEventListener("change", (e) => {
  lineWidth = e.target.value;
  socket.emit("message", { lineWidth });
});

strokeColorInput.addEventListener("change", (e) => {
  strokeStyle = e.target.value;
  socket.emit("message", { color: strokeStyle });
});
