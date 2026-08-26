const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'app/console');

const replacements = [
  { regex: /bg-white/g, replacement: 'bg-[#09090b]' },
  { regex: /bg-mist\/30/g, replacement: 'bg-[#111115]' },
  { regex: /bg-mist\/50/g, replacement: 'bg-[#111115]' },
  { regex: /bg-mist/g, replacement: 'bg-[#111115]' },
  { regex: /text-ink\/60/g, replacement: 'text-white/60' },
  { regex: /text-ink\/50/g, replacement: 'text-white/50' },
  { regex: /text-ink\/80/g, replacement: 'text-white/80' },
  { regex: /text-ink\/40/g, replacement: 'text-white/40' },
  { regex: /text-ink\/70/g, replacement: 'text-white/70' },
  { regex: /text-ink/g, replacement: 'text-white' },
  { regex: /border-ink\/8/g, replacement: 'border-white/10' },
  { regex: /border-ink\/5/g, replacement: 'border-white/10' },
  { regex: /border-ink\/10/g, replacement: 'border-white/10' },
  { regex: /border-ink\/20/g, replacement: 'border-white/20' },
  { regex: /shadow-sm/g, replacement: 'shadow-[0_0_15px_rgba(255,255,255,0.02)]' },
  { regex: /hover:bg-white/g, replacement: 'hover:bg-white/5' },
  // Fix button text contrast where text-ink was replaced by text-white but background is white/teal
  { regex: /bg-teal text-white/g, replacement: 'bg-teal text-ink' },
];

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(directoryPath, function(filePath) {
  if (filePath.endsWith('.tsx') && !filePath.includes('layout.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    
    replacements.forEach(({ regex, replacement }) => {
      content = content.replace(regex, replacement);
    });

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});
