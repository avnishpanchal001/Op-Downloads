import os
import struct
import zlib

def make_png(width, height, rgba_data):
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png += chunk(b'IHDR', ihdr_data)
    
    # IDAT chunk (scanlines with filter byte 0)
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        start = y * width * 4
        raw.extend(rgba_data[start:start + width * 4])
        
    compressed = zlib.compress(bytes(raw), 9)
    png += chunk(b'IDAT', compressed)
    
    # IEND chunk
    png += chunk(b'IEND', b'')
    return png

def chunk(chunk_type, data):
    length = struct.pack('>I', len(data))
    crc = struct.pack('>I', zlib.crc32(chunk_type + data) & 0xffffffff)
    return length + chunk_type + data + crc

def render_download_icon(size):
    # Pixel grid: 12x12 matrix for download icon (arrow + tray)
    # 0 = yellow background, 1 = dark black icon
    matrix = [
        [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ]
    
    m_rows = len(matrix)
    m_cols = len(matrix[0])
    
    # Background color: vibrant yellow #FFE600
    bg_r, bg_g, bg_b = 0xFF, 0xE6, 0x00
    # Icon color: dark slate #0F172A
    fg_r, fg_g, fg_b = 0x0F, 0x17, 0x2A
    
    # Calculate scale factor for icon
    pixel_size = max(1, int(size * 0.065))
    total_w = m_cols * pixel_size
    total_h = m_rows * pixel_size
    start_x = (size - total_w) // 2
    start_y = (size - total_h) // 2
    
    corner_radius = max(2, int(size * 0.22))
    
    rgba = bytearray(size * size * 4)
    
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            
            # Check rounded corner
            dx = 0
            if x < corner_radius:
                dx = corner_radius - x
            elif x >= size - corner_radius:
                dx = x - (size - corner_radius - 1)
                
            dy = 0
            if y < corner_radius:
                dy = corner_radius - y
            elif y >= size - corner_radius:
                dy = y - (size - corner_radius - 1)
                
            if dx > 0 and dy > 0 and (dx * dx + dy * dy > corner_radius * corner_radius):
                # Transparent outside rounded box
                rgba[idx:idx+4] = b'\x00\x00\x00\x00'
                continue
                
            # Default yellow background
            r, g, b, a = bg_r, bg_g, bg_b, 0xFF
            
            # Check matrix position
            mx = (x - start_x) // pixel_size
            my = (y - start_y) // pixel_size
            
            if 0 <= mx < m_cols and 0 <= my < m_rows:
                if matrix[my][mx] == 1:
                    r, g, b = fg_r, fg_g, fg_b
                    
            rgba[idx] = r
            rgba[idx + 1] = g
            rgba[idx + 2] = b
            rgba[idx + 3] = a
            
    return make_png(size, size, rgba)

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sizes = [16, 32, 48, 128]
    
    for s in sizes:
        png_data = render_download_icon(s)
        
        # Save to icons/
        p1 = os.path.join(root, 'icons', f'icon{s}.png')
        os.makedirs(os.path.dirname(p1), exist_ok=True)
        with open(p1, 'wb') as f:
            f.write(png_data)
            
        # Save to extension/icons/
        p2 = os.path.join(root, 'extension', 'icons', f'icon{s}.png')
        os.makedirs(os.path.dirname(p2), exist_ok=True)
        with open(p2, 'wb') as f:
            f.write(png_data)
            
        print(f"Generated icon{s}.png ({len(png_data)} bytes)")

if __name__ == '__main__':
    main()
