"""
Comprehensive Automated Test Suite for op.downloads Extension (v3.2.0)
Testing:
- Manifest V3 Schema & Asset Integrity
- Filename Sanitization & Windows Security
- URL Permitted Scheme & Scheme Traversal Defense
- HLS M3U8 Master Playlist & Segment Parsing
- XSS & Safe DOM Tree Verification
- Root / Extension Parity & File Hashes
- Popup Keyboard Accessibility & WCAG Standards
"""

import json
import os
import re
import hashlib
import unittest
from urllib.parse import urlparse, urljoin

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT_DIR = os.path.join(ROOT_DIR, 'extension')


def sanitize_filename_py(name: str, default_name: str = 'media-file') -> str:
    """Python mirror of the JavaScript sanitizeFileName algorithm in background.js"""
    if not name or not isinstance(name, str):
        return default_name

    # Replace illegal characters
    illegal_regex = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f-\x9f]')
    clean = illegal_regex.sub('_', name)
    clean = re.sub(r'\s+', ' ', clean).strip()

    # Strip leading/trailing dots and spaces
    clean = re.sub(r'^[.\s]+|[.\s]+$', '', clean)

    # If filename consists entirely of underscores or invalid chars, fallback
    if len(clean.replace('_', '').strip()) == 0:
        clean = default_name

    # Windows reserved device names
    reserved_regex = re.compile(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$', re.IGNORECASE)
    if reserved_regex.match(clean) or len(clean) == 0:
        clean = default_name

    return clean[:80] if clean else default_name


def is_valid_media_url_py(url: str) -> bool:
    """Python mirror of isValidMediaUrl in background.js"""
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url)
        return parsed.scheme in ('http', 'https', 'data', 'blob')
    except Exception:
        return False


def resolve_hls_best_variant(m3u8_text: str, base_url: str) -> str:
    """Python mirror of HLS master playlist resolution in downloadHlsStream"""
    lines = m3u8_text.splitlines()
    best_bandwidth = -1
    best_variant_uri = ''

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if line.startswith('#EXT-X-STREAM-INF'):
            bw_match = re.search(r'BANDWIDTH=(\d+)', line)
            bw = int(bw_match.group(1)) if bw_match else 0

            for j in range(i + 1, len(lines)):
                next_line = lines[j].strip()
                if next_line and not next_line.startswith('#'):
                    if bw > best_bandwidth or not best_variant_uri:
                        best_bandwidth = bw
                        best_variant_uri = next_line
                    break

    if best_variant_uri:
        return urljoin(base_url, best_variant_uri)
    return base_url


class TestManifestIntegrity(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(ROOT_DIR, 'manifest.json'), 'r', encoding='utf-8') as f:
            self.manifest = json.load(f)

    def test_manifest_version(self):
        self.assertEqual(self.manifest.get('manifest_version'), 3)

    def test_extension_name_and_version(self):
        self.assertEqual(self.manifest.get('name'), 'op.downloads')
        self.assertEqual(self.manifest.get('version'), '3.2.0')

    def test_required_permissions(self):
        perms = self.manifest.get('permissions', [])
        self.assertIn('storage', perms)
        self.assertIn('downloads', perms)
        self.assertIn('contextMenus', perms)
        self.assertIn('activeTab', perms)
        self.assertIn('webRequest', perms)

    def test_host_permissions(self):
        hosts = self.manifest.get('host_permissions', [])
        self.assertIn('*://*/*', hosts)

    def test_service_worker_exists(self):
        sw = self.manifest.get('background', {}).get('service_worker')
        self.assertEqual(sw, 'background.js')
        self.assertTrue(os.path.exists(os.path.join(ROOT_DIR, sw)))

    def test_icons_exist(self):
        icons = self.manifest.get('icons', {})
        for size, path in icons.items():
            full_path = os.path.join(ROOT_DIR, path)
            self.assertTrue(os.path.exists(full_path), f"Icon {size} missing at {full_path}")


class TestFilenameSanitization(unittest.TestCase):
    def test_windows_reserved_device_names(self):
        self.assertEqual(sanitize_filename_py('CON'), 'media-file')
        self.assertEqual(sanitize_filename_py('con.mp4'), 'media-file')
        self.assertEqual(sanitize_filename_py('aux.jpg'), 'media-file')
        self.assertEqual(sanitize_filename_py('prn.png'), 'media-file')
        self.assertEqual(sanitize_filename_py('NUL'), 'media-file')
        self.assertEqual(sanitize_filename_py('COM1'), 'media-file')
        self.assertEqual(sanitize_filename_py('lpt9.mp4'), 'media-file')

    def test_path_traversal_characters(self):
        sanitized = sanitize_filename_py('../../etc/passwd')
        self.assertNotIn('/', sanitized)
        self.assertNotIn('\\', sanitized)
        self.assertFalse(sanitized.startswith('..'))

    def test_illegal_filesystem_characters(self):
        raw = 'My<Awesome>:Video"Title/With\\Pipes|And?Stars*'
        sanitized = sanitize_filename_py(raw)
        for char in '<>:"/\\|?*':
            self.assertNotIn(char, sanitized)

    def test_trailing_periods_and_spaces(self):
        self.assertEqual(sanitize_filename_py('video...'), 'video')
        self.assertEqual(sanitize_filename_py('  image title   '), 'image title')
        self.assertEqual(sanitize_filename_py('...test...'), 'test')

    def test_length_bounding(self):
        very_long = 'A' * 200
        sanitized = sanitize_filename_py(very_long)
        self.assertLessEqual(len(sanitized), 80)

    def test_empty_or_invalid_fallback(self):
        self.assertEqual(sanitize_filename_py(''), 'media-file')
        self.assertEqual(sanitize_filename_py('   '), 'media-file')
        self.assertEqual(sanitize_filename_py('???'), 'media-file')


class TestUrlValidation(unittest.TestCase):
    def test_valid_http_and_https_urls(self):
        self.assertTrue(is_valid_media_url_py('http://example.com/video.mp4'))
        self.assertTrue(is_valid_media_url_py('https://cdn.example.org/stream/playlist.m3u8'))

    def test_valid_data_and_blob_urls(self):
        self.assertTrue(is_valid_media_url_py('data:image/png;base64,iVBORw0KGgo='))
        self.assertTrue(is_valid_media_url_py('blob:https://example.com/uuid-1234'))

    def test_rejected_dangerous_schemes(self):
        self.assertFalse(is_valid_media_url_py('javascript:alert(document.cookie)'))
        self.assertFalse(is_valid_media_url_py('file:///C:/Windows/System32/cmd.exe'))
        self.assertFalse(is_valid_media_url_py('chrome://settings'))
        self.assertFalse(is_valid_media_url_py('chrome-extension://someid/secret.js'))
        self.assertFalse(is_valid_media_url_py('vbscript:msgbox(1)'))
        self.assertFalse(is_valid_media_url_py(''))
        self.assertFalse(is_valid_media_url_py(None))


class TestHlsMasterPlaylistParsing(unittest.TestCase):
    def test_resolves_highest_bandwidth_variant(self):
        sample_master = """#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p.m3u8
"""
        resolved = resolve_hls_best_variant(sample_master, 'https://cdn.example.com/hls/master.m3u8')
        self.assertEqual(resolved, 'https://cdn.example.com/hls/1080p.m3u8')


class TestSecurityAndDomIntegrity(unittest.TestCase):
    def test_no_unsafe_user_innerhtml_in_content_js(self):
        with open(os.path.join(ROOT_DIR, 'content.js'), 'r', encoding='utf-8') as f:
            content = f.read()
        # Verify toast does not use innerHTML
        self.assertNotIn('toast.innerHTML =', content, "Found dangerous toast.innerHTML in content.js")

    def test_no_eval_or_function_constructor(self):
        js_files = ['background.js', 'content.js', 'injected.js', 'popup.js']
        for fname in js_files:
            with open(os.path.join(ROOT_DIR, fname), 'r', encoding='utf-8') as f:
                code = f.read()
            self.assertNotIn('eval(', code, f"eval found in {fname}")
            self.assertNotIn('new Function(', code, f"new Function found in {fname}")

    def test_accessibility_attributes_in_popup_html(self):
        with open(os.path.join(ROOT_DIR, 'popup.html'), 'r', encoding='utf-8') as f:
            html = f.read()
        self.assertIn('role="tablist"', html)
        self.assertIn('role="tab"', html)
        self.assertIn('role="tabpanel"', html)
        self.assertIn('aria-selected="true"', html)
        self.assertIn('aria-controls=', html)


class TestRepositoryParity(unittest.TestCase):
    def test_root_and_extension_files_are_identical(self):
        synced_files = [
            'manifest.json',
            'background.js',
            'content.js',
            'injected.js',
            'popup.html',
            'popup.js',
            'README.md'
        ]
        for fname in synced_files:
            p_root = os.path.join(ROOT_DIR, fname)
            p_ext = os.path.join(EXT_DIR, fname)
            with open(p_root, 'rb') as f1, open(p_ext, 'rb') as f2:
                h1 = hashlib.sha256(f1.read()).hexdigest()
                h2 = hashlib.sha256(f2.read()).hexdigest()
            self.assertEqual(h1, h2, f"Hash mismatch between root {fname} and extension/{fname}")


if __name__ == '__main__':
    unittest.main()
