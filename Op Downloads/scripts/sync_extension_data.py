import os
import shutil

def escape_for_ts(text: str) -> str:
    # In JS/TS template literals, escape \ as \\, ` as \`, and ${ as \${
    text = text.replace('\\', '\\\\')
    text = text.replace('`', '\\`')
    text = text.replace('${', '\\${')
    return text

def read_file(path: str) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    extension_dir = os.path.join(root, 'extension')
    os.makedirs(extension_dir, exist_ok=True)
    
    files_to_sync = [
        'manifest.json',
        'background.js',
        'injected.js',
        'content.js',
        'popup.html',
        'popup.js',
        'README.md'
    ]
    
    # 1. Sync files from root to extension/ directory
    for fname in files_to_sync:
        src = os.path.join(root, fname)
        dst = os.path.join(extension_dir, fname)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f'[SYNC] Copied {fname} -> extension/{fname}')
    
    # 2. Sync icons directory
    icons_src = os.path.join(root, 'icons')
    icons_dst = os.path.join(extension_dir, 'icons')
    if os.path.exists(icons_src):
        os.makedirs(icons_dst, exist_ok=True)
        for icon in os.listdir(icons_src):
            shutil.copy2(os.path.join(icons_src, icon), os.path.join(icons_dst, icon))
    
    # 3. Read synchronized files for TypeScript exporter
    manifest = read_file(os.path.join(root, 'manifest.json'))
    background = read_file(os.path.join(root, 'background.js'))
    injected = read_file(os.path.join(root, 'injected.js'))
    content = read_file(os.path.join(root, 'content.js'))
    popup_html = read_file(os.path.join(root, 'popup.html'))
    popup_js = read_file(os.path.join(root, 'popup.js'))
    readme = read_file(os.path.join(root, 'README.md'))
    
    out_lines = [
        '/**',
        ' * Complete Chrome Extension Source Code & Definitions for "op.downloads" (v3.2.0)',
        ' */',
        '',
        'export interface ExtensionFile {',
        '  name: string;',
        '  path: string;',
        '  language: string;',
        '  description: string;',
        '  content: string;',
        '}',
        '',
        f'export const MANIFEST_JSON = `{escape_for_ts(manifest)}`;',
        '',
        f'export const BACKGROUND_JS = `{escape_for_ts(background)}`;',
        '',
        f'export const INJECTED_JS = `{escape_for_ts(injected)}`;',
        '',
        f'export const CONTENT_JS = `{escape_for_ts(content)}`;',
        '',
        f'export const POPUP_HTML = `{escape_for_ts(popup_html)}`;',
        '',
        f'export const POPUP_JS = `{escape_for_ts(popup_js)}`;',
        '',
        f'export const README_MD = `{escape_for_ts(readme)}`;',
        '',
        'export const EXTENSION_FILES: ExtensionFile[] = [',
        '  {',
        "    name: 'manifest.json',",
        "    path: 'manifest.json',",
        "    language: 'json',",
        "    description: 'Manifest V3 configuration with storage, downloads, contextMenus, and activeTab permissions.',",
        '    content: MANIFEST_JSON',
        '  },',
        '  {',
        "    name: 'injected.js',",
        "    path: 'injected.js',",
        "    language: 'javascript',",
        "    description: 'MAIN world speed controller and YouTube video stream hook.',",
        '    content: INJECTED_JS',
        '  },',
        '  {',
        "    name: 'content.js',",
        "    path: 'content.js',",
        "    language: 'javascript',",
        "    description: 'Hover download button, restricted media unlocker, and 1x-10x video speed engine.',",
        '    content: CONTENT_JS',
        '  },',
        '  {',
        "    name: 'background.js',",
        "    path: 'background.js',",
        "    language: 'javascript',",
        "    description: 'High-speed background service worker managing JPG/PNG conversions and video downloads.',",
        '    content: BACKGROUND_JS',
        '  },',
        '  {',
        "    name: 'popup.html',",
        "    path: 'popup.html',",
        "    language: 'html',",
        "    description: 'op.downloads popup interface for video, image, and speed controls.',",
        '    content: POPUP_HTML',
        '  },',
        '  {',
        "    name: 'popup.js',",
        "    path: 'popup.js',",
        "    language: 'javascript',",
        "    description: 'Popup controller handling downloads, image galleries, and speed presets.',",
        '    content: POPUP_JS',
        '  },',
        '  {',
        "    name: 'README.md',",
        "    path: 'README.md',",
        "    language: 'markdown',",
        "    description: 'Full documentation and installation guide for op.downloads.',",
        '    content: README_MD',
        '  }',
        '];',
        ''
    ]
    
    out_path = os.path.join(root, 'src', 'extensionData.ts')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out_lines))
        
    print(f'Successfully updated {out_path} ({len("\n".join(out_lines))} characters)')

if __name__ == '__main__':
    main()
