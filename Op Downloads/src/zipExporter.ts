import JSZip from 'jszip';
import { EXTENSION_FILES, generateIconBlob } from './extensionData';

export async function createExtensionZip(): Promise<Blob> {
  const zip = new JSZip();

  // 1. Add all code & config files to zip root
  for (const file of EXTENSION_FILES) {
    zip.file(file.name, file.content);
  }

  // 2. Add icons folder with generated PNGs
  const iconsFolder = zip.folder('icons');
  if (iconsFolder) {
    const iconSizes = [16, 32, 48, 128];
    for (const size of iconSizes) {
      const blob = await generateIconBlob(size);
      iconsFolder.file(`icon${size}.png`, blob);
    }
  }

  // 3. Generate the ZIP blob
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
