const editorCanvas = document.getElementById("editorCanvas");
const selectionCanvas = document.getElementById("selectionCanvas");
const ctx = editorCanvas.getContext("2d");
const selectionCtx = selectionCanvas.getContext("2d");

const fileInput = document.getElementById("fileInput");
const newCanvasBtn = document.getElementById("newCanvasBtn");
const saveBtn = document.getElementById("saveBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const zoomRange = document.getElementById("zoomRange");
const brushSize = document.getElementById("brushSize");
const brushColor = document.getElementById("brushColor");
const opacityRange = document.getElementById("opacityRange");
const widthInput = document.getElementById("widthInput");
const heightInput = document.getElementById("heightInput");
const addTextBtn = document.getElementById("addTextBtn");
const textInput = document.getElementById("textInput");
const grayscaleBtn = document.getElementById("grayscaleBtn");
const invertBtn = document.getElementById("invertBtn");
const clearBtn = document.getElementById("clearBtn");
const brightnessRange = document.getElementById("brightnessRange");
const contrastRange = document.getElementById("contrastRange");
const layerList = document.getElementById("layerList");
const statusBar = document.getElementById("statusBar");
const toolButtons = document.querySelectorAll(".tool-btn");
const canvasStack = document.querySelector(".canvas-stack");

const state = {
  tool: "brush",
  drawing: false,
  draggingSelection: false,
  selecting: false,
  imageLoaded: false,
  zoom: 1,
  selection: null,
  selectionImageData: null,
  moveOffset: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  history: [],
  future: [],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateStatus(message) {
  statusBar.textContent = message;
}

function syncOverlaySize() {
  selectionCanvas.width = editorCanvas.width;
  selectionCanvas.height = editorCanvas.height;
  canvasStack.style.width = `${editorCanvas.width}px`;
  canvasStack.style.height = `${editorCanvas.height}px`;
}

function fillWhiteBackground() {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);
  ctx.restore();
}

function createBlankCanvas(width, height) {
  editorCanvas.width = width;
  editorCanvas.height = height;
  syncOverlaySize();
  fillWhiteBackground();
  clearSelection();
  pushHistory();
  renderLayers();
  applyZoom();
  updateStatus(`New canvas created: ${width}×${height}`);
}

function pushHistory() {
  try {
    state.history.push(ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height));
    if (state.history.length > 30) {
      state.history.shift();
    }
    state.future = [];
  } catch (error) {
    updateStatus("Unable to save history snapshot.");
  }
}

function restoreImageData(imageData) {
  editorCanvas.width = imageData.width;
  editorCanvas.height = imageData.height;
  syncOverlaySize();
  ctx.putImageData(imageData, 0, 0);
  renderLayers();
  applyZoom();
}

function undo() {
  if (state.history.length <= 1) {
    updateStatus("Nothing to undo.");
    return;
  }
  const current = state.history.pop();
  state.future.push(current);
  const previous = state.history[state.history.length - 1];
  restoreImageData(previous);
  updateStatus("Undo complete.");
}

function redo() {
  if (!state.future.length) {
    updateStatus("Nothing to redo.");
    return;
  }
  const next = state.future.pop();
  state.history.push(next);
  restoreImageData(next);
  updateStatus("Redo complete.");
}

function applyZoom() {
  state.zoom = Number(zoomRange.value) / 100;
  canvasStack.style.transform = `scale(${state.zoom})`;
  canvasStack.style.margin = `${((state.zoom - 1) * 100) / 2}px`;
}

function getCanvasPoint(event) {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;
  return {
    x: clamp((event.clientX - rect.left) * scaleX, 0, editorCanvas.width),
    y: clamp((event.clientY - rect.top) * scaleY, 0, editorCanvas.height),
  };
}

function setTool(tool) {
  state.tool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  updateStatus(`Tool: ${tool}`);
}

function renderLayers() {
  const layers = [
    { name: "Background", info: `${editorCanvas.width}×${editorCanvas.height}` },
    { name: "Paint Layer", info: "Brush / Eraser / Text" },
  ];

  if (state.imageLoaded) {
    layers.splice(1, 0, { name: "Imported Image", info: "Loaded from file" });
  }

  layerList.innerHTML = layers
    .map(
      (layer) => `
        <div class="layer-item">
          <div>
            <strong>${layer.name}</strong>
            <span>${layer.info}</span>
          </div>
        </div>
      `
    )
    .join("");
}

function clearSelection() {
  state.selection = null;
  state.selectionImageData = null;
  state.draggingSelection = false;
  selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
}

function drawSelectionRect(rect) {
  selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
  if (!rect) return;
  selectionCtx.save();
  selectionCtx.setLineDash([8, 6]);
  selectionCtx.strokeStyle = "#4ea1ff";
  selectionCtx.lineWidth = 2;
  selectionCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  selectionCtx.restore();
}

function normalizeRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { x, y, width, height };
}

function startStroke(point) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Number(brushSize.value);
  ctx.globalAlpha = Number(opacityRange.value);

  if (state.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = brushColor.value;
  }

  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  state.lastX = point.x;
  state.lastY = point.y;
}

function continueStroke(point) {
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  state.lastX = point.x;
  state.lastY = point.y;
}

function finishStroke() {
  ctx.restore();
  pushHistory();
}

function pickColor(point) {
  const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
  const hex = `#${[pixel[0], pixel[1], pixel[2]]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
  brushColor.value = hex;
  updateStatus(`Picked color ${hex}`);
}

function addTextAt(x, y) {
  const text = textInput.value.trim() || "Text";
  ctx.save();
  ctx.fillStyle = brushColor.value;
  ctx.globalAlpha = Number(opacityRange.value);
  ctx.font = `${Math.max(14, Number(brushSize.value) * 2)}px Arial`;
  ctx.fillText(text, x, y);
  ctx.restore();
  pushHistory();
  renderLayers();
  updateStatus(`Text added: "${text}"`);
}

function moveSelectionTo(x, y) {
  if (!state.selection || !state.selectionImageData || !state.moveOffset) return;
  const destX = Math.round(x - state.moveOffset.x);
  const destY = Math.round(y - state.moveOffset.y);
  state.selection = {
    x: destX,
    y: destY,
    width: state.selectionImageData.width,
    height: state.selectionImageData.height,
  };
  drawSelectionRect(state.selection);
}

function commitSelectionMove() {
  if (!state.selection || !state.selectionImageData) return;
  ctx.putImageData(state.selectionImageData, state.selection.x, state.selection.y);
  pushHistory();
  drawSelectionRect(state.selection);
  updateStatus("Selection moved.");
}

function applyPixelFilter(transformer) {
  const imageData = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    transformer(data, i);
  }

  ctx.putImageData(imageData, 0, 0);
  pushHistory();
}

function applyBrightnessContrast() {
  const brightness = Number(brightnessRange.value);
  const contrast = Number(contrastRange.value);
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  const imageData = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(factor * (data[i] - 128) + 128 + brightness, 0, 255);
    data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128 + brightness, 0, 255);
    data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128 + brightness, 0, 255);
  }

  ctx.putImageData(imageData, 0, 0);
  pushHistory();
  updateStatus("Brightness/contrast applied.");
}

function importImage(file) {
  const reader = new FileReader();

  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      widthInput.value = image.width;
      heightInput.value = image.height;
      editorCanvas.width = image.width;
      editorCanvas.height = image.height;
      syncOverlaySize();
      fillWhiteBackground();
      ctx.drawImage(image, 0, 0);
      state.imageLoaded = true;
      clearSelection();
      pushHistory();
      renderLayers();
      applyZoom();
      updateStatus(`Loaded image: ${file.name}`);
    };
    image.src = reader.result;
  };

  reader.readAsDataURL(file);
}

function saveCanvas() {
  const link = document.createElement("a");
  link.download = "photostudio-export.png";
  link.href = editorCanvas.toDataURL("image/png");
  link.click();
  updateStatus("PNG saved.");
}

editorCanvas.addEventListener("mousedown", (event) => {
  const point = getCanvasPoint(event);
  state.startX = point.x;
  state.startY = point.y;

  if (state.tool === "brush" || state.tool === "eraser") {
    state.drawing = true;
    startStroke(point);
    return;
  }

  if (state.tool === "eyedropper") {
    pickColor(point);
    return;
  }

  if (state.tool === "text") {
    addTextAt(point.x, point.y);
    return;
  }

  if (state.tool === "select") {
    state.selecting = true;
    drawSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
    return;
  }

  if (state.tool === "move" && state.selection && state.selectionImageData) {
    state.draggingSelection = true;
    state.moveOffset = {
      x: point.x - state.selection.x,
      y: point.y - state.selection.y,
    };
  }
});

editorCanvas.addEventListener("mousemove", (event) => {
  const point = getCanvasPoint(event);
  updateStatus(`Tool: ${state.tool} | X: ${Math.round(point.x)} Y: ${Math.round(point.y)} | Zoom: ${Math.round(state.zoom * 100)}%`);

  if (state.drawing) {
    continueStroke(point);
    return;
  }

  if (state.selecting) {
    const rect = normalizeRect(state.startX, state.startY, point.x, point.y);
    drawSelectionRect(rect);
    return;
  }

  if (state.draggingSelection) {
    moveSelectionTo(point.x, point.y);
  }
});

window.addEventListener("mouseup", (event) => {
  const point = getCanvasPoint(event);

  if (state.drawing) {
    state.drawing = false;
    finishStroke();
    return;
  }

  if (state.selecting) {
    state.selecting = false;
    const rect = normalizeRect(state.startX, state.startY, point.x, point.y);

    if (rect.width > 2 && rect.height > 2) {
      state.selection = rect;
      state.selectionImageData = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
      drawSelectionRect(rect);
      pushHistory();
      updateStatus("Selection captured. Switch to Move tool to reposition it.");
    } else {
      clearSelection();
    }
    return;
  }

  if (state.draggingSelection) {
    state.draggingSelection = false;
    commitSelectionMove();
  }
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    updateStatus("No file selected.");
    return;
  }
  importImage(file);
});

newCanvasBtn.addEventListener("click", () => {
  const width = clamp(Number(widthInput.value) || 1000, 64, 4000);
  const height = clamp(Number(heightInput.value) || 700, 64, 4000);
  widthInput.value = width;
  heightInput.value = height;
  state.imageLoaded = false;
  createBlankCanvas(width, height);
});

saveBtn.addEventListener("click", saveCanvas);
undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

zoomRange.addEventListener("input", applyZoom);

addTextBtn.addEventListener("click", () => {
  addTextAt(40, 60);
});

clearBtn.addEventListener("click", () => {
  fillWhiteBackground();
  clearSelection();
  pushHistory();
  renderLayers();
  updateStatus("Canvas cleared.");
});

grayscaleBtn.addEventListener("click", () => {
  applyPixelFilter((data, i) => {
    const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  });
  updateStatus("Grayscale applied.");
});

invertBtn.addEventListener("click", () => {
  applyPixelFilter((data, i) => {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  });
  updateStatus("Invert applied.");
});

brightnessRange.addEventListener("change", applyBrightnessContrast);
contrastRange.addEventListener("change", applyBrightnessContrast);

syncOverlaySize();
fillWhiteBackground();
pushHistory();
renderLayers();
applyZoom();
updateStatus("Editor ready.");
