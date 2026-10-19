(function (scope) {
'use strict';
const rows = ['idle','running-right','running-left','waving','jumping','failed','waiting','running','review'];
function inspect(image, loopMs = 1600) {
  if (image.width !== 1536 || image.height !== 1872) throw new Error('图集尺寸必须为 1536×1872');
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
  const result = rows.map((name, row) => {
    const cells = Array.from({ length: 8 }, (_, col) => {
      const pixels = ctx.getImageData(col * 192, row * 208, 192, 208).data;
      let alphaPixels = 0, minX = 192, minY = 208, maxX = -1, maxY = -1;
      for (let y = 0; y < 208; y++) for (let x = 0; x < 192; x++) if (pixels[(y * 192 + x) * 4 + 3]) { alphaPixels++; minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y); }
      return { col, alphaPixels, empty: alphaPixels === 0, bounds: alphaPixels ? { minX,minY,maxX,maxY } : null, withinCell: maxX < 192 && maxY < 208, touchesEdge: alphaPixels > 0 && (minX === 0 || minY === 0 || maxX === 191 || maxY === 207) };
    });
    let frames = 0; while (frames < 8 && !cells[frames].empty) frames++;
    if (!frames || cells.slice(frames).some(cell => !cell.empty)) throw new Error('图集行不完整：' + name);
    return { name, row, frames, frameMs: loopMs / frames, complete: true, cells };
  });
  return { width: image.width, height: image.height, cellWidth:192, cellHeight:208, loopMs, rows: result, atlasOk:true };
}
function drawFrame(ctx, image, atlas, rowName, frame, dx = 0, dy = 0, cellW, cellH) {
  const row = atlas.rows.find(r => r.name === rowName); const index = ((frame % row.frames) + row.frames) % row.frames;
  const w = cellW || ctx.canvas.width, h = cellH || ctx.canvas.height;
  ctx.clearRect(dx,dy,w,h); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, index * 192,row.row * 208,192,208,dx,dy,w,h);
}
scope.GuangguoAtlas = { inspect, drawFrame, rows };
})(globalThis);
