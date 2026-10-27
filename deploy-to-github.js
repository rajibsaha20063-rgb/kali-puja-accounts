/**
 * Automated GitHub Deployer using GitHub REST API v3
 * Uploads all project files directly to a new or existing repository.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.argv[2];
const REPO_NAME = process.env.GITHUB_REPO || process.argv[3] || 'kali-puja-accounts';
const IS_PRIVATE = process.argv[4] === 'private';

if (!GITHUB_TOKEN) {
  console.error('\n❌ ERROR: GitHub Personal Access Token is required.');
  console.error('Usage: node deploy-to-github.js <GITHUB_TOKEN> [REPO_NAME] [public|private]');
  process.exit(1);
}

function githubRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'User-Agent': 'Kali-Puja-Deployer',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, data: parsed });
          }
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Collect all project files
const IGNORED_PATHS = ['.git', 'node_modules', '.env', 'demo-data.json', 'users.json', '.DS_Store'];

function getFiles(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (IGNORED_PATHS.includes(file)) continue;
    const fullPath = path.join(dir, file);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, baseDir));
    } else {
      results.push({ relPath, fullPath });
    }
  }
  return results;
}

async function run() {
  try {
    console.log(`\n🚀 Starting automated push to GitHub for repository: "${REPO_NAME}"...`);

    // 1. Get authenticated user
    const user = await githubRequest('/user');
    const owner = user.login;
    console.log(`✅ Authenticated as GitHub user: @${owner}`);

    // 2. Create or verify repository
    let repo;
    try {
      repo = await githubRequest(`/repos/${owner}/${REPO_NAME}`);
      console.log(`ℹ️ Repository "${REPO_NAME}" already exists. Updating existing files...`);
    } catch (err) {
      if (err.status === 404) {
        console.log(`🔨 Creating new GitHub repository "${REPO_NAME}"...`);
        repo = await githubRequest('/user/repos', 'POST', {
          name: REPO_NAME,
          description: 'Neighbourhood Club Kali Puja Accounts & Audit Web Application',
          private: IS_PRIVATE,
          auto_init: true
        });
        console.log(`✅ Repository created: ${repo.html_url}`);
        // Small wait for GitHub initialization
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }

    // 3. Collect files
    const files = getFiles(__dirname);
    console.log(`📦 Found ${files.length} project files to upload:`);
    files.forEach(f => console.log(`   - ${f.relPath}`));

    // 4. Create blobs
    console.log('\n⏳ Uploading file contents (creating git blobs)...');
    const treeItems = [];
    for (const file of files) {
      const content = fs.readFileSync(file.fullPath);
      const isBinary = file.relPath.endsWith('.ico') || file.relPath.endsWith('.png') || file.relPath.endsWith('.jpg');
      
      const blob = await githubRequest(`/repos/${owner}/${REPO_NAME}/git/blobs`, 'POST', {
        content: content.toString(isBinary ? 'base64' : 'utf8'),
        encoding: isBinary ? 'base64' : 'utf-8'
      });

      treeItems.push({
        path: file.relPath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }

    // 5. Get default branch SHA
    const defaultBranch = repo.default_branch || 'main';
    let baseTreeSha = null;
    let parentCommitSha = null;

    try {
      const ref = await githubRequest(`/repos/${owner}/${REPO_NAME}/git/ref/heads/${defaultBranch}`);
      parentCommitSha = ref.object.sha;
      const commit = await githubRequest(`/repos/${owner}/${REPO_NAME}/git/commits/${parentCommitSha}`);
      baseTreeSha = commit.tree.sha;
    } catch (e) {
      console.log('ℹ️ Initializing new branch head...');
    }

    // 6. Create tree
    console.log('🌳 Building git tree...');
    const treePayload = { tree: treeItems };
    if (baseTreeSha) treePayload.base_tree = baseTreeSha;
    const tree = await githubRequest(`/repos/${owner}/${REPO_NAME}/git/trees`, 'POST', treePayload);

    // 7. Create commit
    console.log('📝 Creating commit: "Deploy Kali Puja Accounts web app"...');
    const commitPayload = {
      message: 'Deploy Kali Puja Accounts & Audit web application',
      tree: tree.sha
    };
    if (parentCommitSha) commitPayload.parents = [parentCommitSha];
    const newCommit = await githubRequest(`/repos/${owner}/${REPO_NAME}/git/commits`, 'POST', commitPayload);

    // 8. Update branch ref
    try {
      await githubRequest(`/repos/${owner}/${REPO_NAME}/git/refs/heads/${defaultBranch}`, 'PATCH', {
        sha: newCommit.sha,
        force: true
      });
    } catch (e) {
      await githubRequest(`/repos/${owner}/${REPO_NAME}/git/refs`, 'POST', {
        ref: `refs/heads/${defaultBranch}`,
        sha: newCommit.sha
      });
    }

    console.log('\n🎉 SUCCESS! All files have been committed to GitHub:');
    console.log(`👉 Repository URL: ${repo.html_url}`);
    console.log('\nNow you can connect this repository to Render.com with 1 click!');

  } catch (err) {
    console.error('\n❌ Deployment failed:');
    console.error(err.data || err.message || err);
    process.exit(1);
  }
}

run();
