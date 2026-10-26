require('dotenv').config();
const { Client } = require('ssh2');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = {
  host: process.env.VDS_HOST || '179.61.147.252',
  port: parseInt(process.env.VDS_PORT || '22', 10),
  username: process.env.VDS_USER || 'root',
  password: process.env.VDS_PASSWORD || '',
  remoteDir: process.env.VDS_REMOTE_DIR || '/var/www/sozunizinde'
};

console.log('🚀 Sözün İzinde Platformu Dağıtımı Başlatılıyor...');

const conn = new Client();
conn.on('ready', async () => {
  console.log('📶 VDS bağlantısı sağlandı.');

  try {
    // 1. Build if package.json has build script
    if (fs.existsSync('package.json')) {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      if (pkg.scripts && pkg.scripts.build) {
        console.log('⚙️ Proje derleniyor (npm run build)...');
        execSync('npm run build', { stdio: 'inherit' });
      }
    }

    // 2. Package
    const targetDir = fs.existsSync('out') ? 'out' : fs.existsSync('dist') ? 'dist' : 'public';
    if (!fs.existsSync(targetDir)) {
      console.log(`⚠️ Dağıtılacak klasör bulunamadı (${targetDir}).`);
      conn.end();
      return;
    }

    console.log(`📦 '${targetDir}' arşivi oluşturuluyor...`);
    if (fs.existsSync('deploy.tar.gz')) fs.unlinkSync('deploy.tar.gz');
    execSync(`tar -czf deploy.tar.gz -C ${targetDir} .`, { stdio: 'inherit' });

    // 3. Upload & Extract
    conn.sftp((err, sftp) => {
      if (err) throw err;
      console.log('📤 Arşiv VDS sunucusuna yükleniyor...');
      sftp.fastPut('deploy.tar.gz', '/tmp/sozunizinde.tar.gz', (uploadErr) => {
        if (uploadErr) throw uploadErr;

        console.log('📁 Sunucuda dosyalar açılıyor...');
        const cmd = `
          mkdir -p ${config.remoteDir} &&
          rm -rf ${config.remoteDir}/* &&
          tar -xzf /tmp/sozunizinde.tar.gz -C ${config.remoteDir} &&
          rm -f /tmp/sozunizinde.tar.gz &&
          nginx -t && systemctl reload nginx
        `;

        conn.exec(cmd, (execErr, stream) => {
          if (execErr) throw execErr;
          stream.on('data', d => process.stdout.write(d.toString()));
          stream.stderr.on('data', d => process.stderr.write(d.toString()));
          stream.on('close', (code) => {
            console.log(`\n🎉 Dağıtım Başarıyla Tamamlandı! (Çıkış Kodu: ${code})`);
            console.log('🌐 Web sitesi: https://sozunizinde.com.tr');
            if (fs.existsSync('deploy.tar.gz')) fs.unlinkSync('deploy.tar.gz');
            conn.end();
          });
        });
      });
    });
  } catch (error) {
    console.error('❌ Dağıtım Hatası:', error);
    conn.end();
  }
}).connect({
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password
});
