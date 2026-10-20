import json
import os

def validate_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"[OK] {os.path.basename(path)} is valid JSON.")
    return data

def validate_js_braces(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pairs = {'{': '}', '(': ')', '[': ']'}
    stack = []
    in_string = None
    escaped = False
    in_line_comment = False
    in_block_comment = False
    
    i = 0
    n = len(content)
    while i < n:
        c = content[i]
        
        if in_line_comment:
            if c == '\n':
                in_line_comment = False
            i += 1
            continue
            
        if in_block_comment:
            if c == '*' and i + 1 < n and content[i+1] == '/':
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue
            
        if in_string:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == in_string:
                in_string = None
            i += 1
            continue
            
        if c == '/' and i + 1 < n:
            if content[i+1] == '/':
                in_line_comment = True
                i += 2
                continue
            elif content[i+1] == '*':
                in_block_comment = True
                i += 2
                continue
                
        if c in ("'", '"', '`'):
            in_string = c
            escaped = False
            i += 1
            continue
            
        if c in '{[(':
            stack.append((c, i))
        elif c in '}])':
            if not stack:
                print(f"[FAIL] {os.path.basename(path)}: Unmatched closing {c} at index {i}")
                return False
            top, _ = stack.pop()
            if pairs[top] != c:
                print(f"[FAIL] {os.path.basename(path)}: Mismatched {top} and {c} at index {i}")
                return False
        i += 1
        
    if stack:
        print(f"[FAIL] {os.path.basename(path)}: Unclosed brackets: {[s[0] for s in stack]}")
        return False
        
    print(f"[OK] {os.path.basename(path)} brackets and strings balanced.")
    return True

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # JSON checks
    manifest = validate_json(os.path.join(root, 'manifest.json'))
    ext_manifest = validate_json(os.path.join(root, 'extension', 'manifest.json'))
    
    assert manifest['name'] == 'op.downloads', f"Expected name op.downloads, got {manifest['name']}"
    assert ext_manifest['name'] == 'op.downloads', f"Expected name op.downloads, got {ext_manifest['name']}"
    assert '*://*/*' in manifest['host_permissions'], "Missing *://*/* in manifest host_permissions"
    
    # JS checks
    files = [
        'background.js',
        'content.js',
        'injected.js',
        'popup.js',
        'extension/background.js',
        'extension/content.js',
        'extension/injected.js',
        'extension/popup.js'
    ]
    
    all_ok = True
    for f in files:
        ok = validate_js_braces(os.path.join(root, f))
        if not ok:
            all_ok = False
            
    if all_ok:
        print("\nALL OP.DOWNLOADS ASSETS FULLY VALIDATED AND READY!")
    else:
        print("\nERRORS DETECTED!")

if __name__ == '__main__':
    main()
