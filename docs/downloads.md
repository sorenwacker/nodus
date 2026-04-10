# Downloads

Download the latest version of Nodus for your platform.

<div id="release-info">
  <p>Loading release information...</p>
</div>

<div id="downloads-container">
</div>

<style>
.download-card {
  border: 1px solid var(--md-default-fg-color--lightest);
  border-radius: 8px;
  padding: 1.5rem;
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 1rem;
}
.download-card:hover {
  border-color: var(--md-accent-fg-color);
}
.download-icon {
  font-size: 2.5rem;
}
.download-info {
  flex: 1;
}
.download-info h3 {
  margin: 0 0 0.25rem 0;
}
.download-info p {
  margin: 0;
  color: var(--md-default-fg-color--light);
  font-size: 0.9rem;
}
.download-btn {
  background: var(--md-accent-fg-color);
  color: var(--md-accent-bg-color) !important;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  text-decoration: none !important;
  font-weight: 500;
}
.download-btn:hover {
  opacity: 0.9;
}
.release-meta {
  margin-bottom: 2rem;
  padding: 1rem;
  background: var(--md-code-bg-color);
  border-radius: 4px;
}
.release-meta h2 {
  margin: 0 0 0.5rem 0;
}
.release-meta p {
  margin: 0;
  color: var(--md-default-fg-color--light);
}
.all-releases {
  margin-top: 2rem;
  text-align: center;
}
</style>

<script>
const REPO = 'sorenwacker/nodus';

const PLATFORM_INFO = {
  'dmg': { name: 'macOS', icon: '🍎', desc: 'Universal binary (Intel + Apple Silicon)' },
  'app.tar.gz': { name: 'macOS (tar.gz)', icon: '🍎', desc: 'Universal binary archive' },
  'msi': { name: 'Windows', icon: '🪟', desc: 'Windows installer (64-bit)' },
  'exe': { name: 'Windows (exe)', icon: '🪟', desc: 'Windows executable' },
  'deb': { name: 'Linux (Debian/Ubuntu)', icon: '🐧', desc: 'Debian package (.deb)' },
  'AppImage': { name: 'Linux (AppImage)', icon: '🐧', desc: 'Portable Linux app' },
  'rpm': { name: 'Linux (Fedora/RHEL)', icon: '🐧', desc: 'RPM package' }
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function getPlatformInfo(filename) {
  for (const [ext, info] of Object.entries(PLATFORM_INFO)) {
    if (filename.endsWith(ext) || filename.includes(ext)) {
      return info;
    }
  }
  return null;
}

async function loadReleases() {
  const releaseInfo = document.getElementById('release-info');
  const container = document.getElementById('downloads-container');

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases`);
    const releases = await response.json();

    // Find latest non-draft release
    const latest = releases.find(r => !r.draft);

    if (!latest) {
      releaseInfo.innerHTML = '<p>No releases available yet.</p>';
      return;
    }

    // Show release info
    const isPrerelease = latest.prerelease || latest.tag_name.includes('rc');
    releaseInfo.innerHTML = `
      <div class="release-meta">
        <h2>${latest.name || latest.tag_name} ${isPrerelease ? '(Release Candidate)' : ''}</h2>
        <p>Released on ${formatDate(latest.published_at)}</p>
      </div>
    `;

    // Filter and sort assets
    const assets = latest.assets
      .filter(a => getPlatformInfo(a.name))
      .sort((a, b) => {
        const order = ['dmg', 'msi', 'deb', 'AppImage'];
        const aIdx = order.findIndex(ext => a.name.includes(ext));
        const bIdx = order.findIndex(ext => b.name.includes(ext));
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      });

    if (assets.length === 0) {
      container.innerHTML = '<p>No downloadable assets found in this release.</p>';
      return;
    }

    // Render download cards
    container.innerHTML = assets.map(asset => {
      const info = getPlatformInfo(asset.name);
      return `
        <div class="download-card">
          <span class="download-icon">${info.icon}</span>
          <div class="download-info">
            <h3>${info.name}</h3>
            <p>${info.desc} (${formatBytes(asset.size)})</p>
          </div>
          <a href="${asset.browser_download_url}" class="download-btn">Download</a>
        </div>
      `;
    }).join('');

    // Add link to all releases
    container.innerHTML += `
      <div class="all-releases">
        <a href="https://github.com/${REPO}/releases">View all releases on GitHub</a>
      </div>
    `;

  } catch (error) {
    releaseInfo.innerHTML = `
      <p>Could not load release information.
      <a href="https://github.com/${REPO}/releases">View releases on GitHub</a></p>
    `;
    console.error('Failed to load releases:', error);
  }
}

// Load on page ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadReleases);
} else {
  loadReleases();
}
</script>

---

## System Requirements

| Platform | Requirements |
|----------|--------------|
| **macOS** | macOS 10.15 (Catalina) or later |
| **Windows** | Windows 10 (64-bit) or later |
| **Linux** | Ubuntu 20.04+, Debian 11+, Fedora 36+ |

## Installation

=== "macOS"

    1. Download the `.dmg` file
    2. Open the disk image
    3. Drag Nodus to your Applications folder
    4. On first launch, right-click and select "Open" to bypass Gatekeeper

=== "Windows"

    1. Download the `.msi` installer
    2. Run the installer
    3. Follow the installation wizard
    4. Launch Nodus from the Start menu

=== "Linux"

    **Debian/Ubuntu:**
    ```bash
    sudo dpkg -i nodus_*.deb
    ```

    **AppImage:**
    ```bash
    chmod +x Nodus_*.AppImage
    ./Nodus_*.AppImage
    ```

## Building from Source

See the [Development](development.md) guide for instructions on building Nodus from source.
