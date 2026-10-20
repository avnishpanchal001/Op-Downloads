import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

function generateSkipIconPng(size) {
  // 12 columns x 10 rows matrix for YouTube skip button (▶|)
  const matrix = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]
  ];

  const mCols = 12;
  const mRows = 10;
  const pixelSize = Math.max(1, Math.floor(size * 0.065));
  const startX = Math.floor((size - mCols * pixelSize) / 2);
  const startY = Math.floor((size - mRows * pixelSize) / 2);
  const borderWidth = Math.max(1, Math.floor(size * 0.05));

  const rawRows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // Filter type None

    for (let x = 0; x < size; x++) {
      const idx = 1 + x * 4;

      // Check if border
      const isBorder = (x < borderWidth || x >= size - borderWidth || y < borderWidth || y >= size - borderWidth);

      // Check if inside pixel skip icon
      let isIcon = false;
      const mx = Math.floor((x - startX) / pixelSize);
      const my = Math.floor((y - startY) / pixelSize);
      if (mx >= 0 && mx < mCols && my >= 0 && my < mRows) {
        if (matrix[my][mx] === 1) {
          isIcon = true;
        }
      }

      if (isIcon) {
        // Solid black pixel-format skip icon
        row[idx] = 0;     // R
        row[idx + 1] = 0; // G
        row[idx + 2] = 0; // B
        row[idx + 3] = 255; // A
      } else if (isBorder) {
        // Dark navy border
        row[idx] = 15;
        row[idx + 1] = 27;
        row[idx + 2] = 46;
        row[idx + 3] = 255;
      } else {
        // Yellow background (#FFE600)
        row[idx] = 255;
        row[idx + 1] = 230;
        row[idx + 2] = 0;
        row[idx + 3] = 255;
      }
    }

    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const dirs = ['extension/icons', 'icons', 'public/icons'];
const sizes = [16, 32, 48, 128];

for (const dir of dirs) {
  fs.mkdirSync(dir, { recursive: true });
  for (const s of sizes) {
    const png = generateSkipIconPng(s);
    const outPath = path.join(dir, `icon${s}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`Generated ${outPath} (${png.length} bytes)`);
  }
}

console.log('All pixel skip icons successfully generated!');
