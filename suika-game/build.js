import { build } from 'vite';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting build process...');

// Build the project
await build();

console.log('✅ Vite build completed');

// Ensure HTML files are copied to dist
const htmlFiles = ['lobby.html', 'game.html'];
const distDir = 'dist';

htmlFiles.forEach(file => {
  const sourcePath = file;
  const destPath = path.join(distDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✅ Copied ${file} to dist/`);
  } else {
    console.log(`❌ ${file} not found in source`);
  }
});

// Copy public assets
if (fs.existsSync('public')) {
  const publicDir = path.join(distDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    files.forEach(file => {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      
      if (fs.statSync(srcPath).isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  };
  
  copyDir('public', publicDir);
  console.log('✅ Copied public assets to dist/');
}

console.log('🎉 Build completed successfully!'); 