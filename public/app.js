/**
 * Kali Puja Accounts & Audit Frontend Application Script
 */

let currentUser = null;
let currentSummary = null;
let currentCollections = [];
let currentExpenses = [];

// Format Indian Currency Number (₹ 1,25,000)
function formatINR(val) {
  const num = Number(val) || 0;
  return '₹ ' + num.toLocaleString('en-IN');
}

// Show Floating Toast Notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout( => {
    toast.remove;
  }, 4000);
}

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });

  if (tabId === 'tab-users' && currentUser?.role === 'admin') {
    fetchUsersList;
  }
}

// Fetch Current Authenticated User
async function checkAuth {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json;
    currentUser = data.user;
    updateUserUI;
  } catch (err) {
    window.location.href = '/login.html';
  }
}

// Update UI elements based on user role
function updateUserUI {
  if (!currentUser) return;

  document.getElementById('userNameText').textContent = currentUser.name || currentUser.username;
  const roleBadge = document.getElementById('userRoleBadge');
  roleBadge.textContent = currentUser.role.toUpperCase;
  roleBadge.className = `badge-role badge-role-${currentUser.role}`;

  // Hide users tab if not admin
  const usersTabBtn = document.getElementById('usersTabBtn');
  if (usersTabBtn) {
    usersTabBtn.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
  }

  // Adjust column headers
  const colActionHeader = document.getElementById('colActionHeader');
  if (colActionHeader) {
    colActionHeader.style.display = (currentUser.role === 'admin' || currentUser.role === 'collector') ? 'table-cell' : 'none';
  }

  const expActionHeader = document.getElementById('expActionHeader');
  if (expActionHeader) {
    expActionHeader.style.display = currentUser.role === 'admin' ? 'table-cell' : 'none';
  }
}

// Check System Mode (Live Google Sheets vs Demo)
async function fetchSystemStatus {
  try {
    const res = await fetch('/api/system/status');
    const data = await res.json;
    const badge = document.getElementById('syncBadge');
    if (data.isDemoMode) {
      badge.textContent = '⚡ DEMO MODE (Local Data)';
      badge.className = 'badge-status badge-demo';
      badge.title = 'Spreadsheet API credentials not provided or offline. Using local storage.';
    } else {
      badge.textContent = '🟢 LIVE SYNC (Google Sheets)';
      badge.className = 'badge-status badge-live';
      badge.title = `Connected to sheet "${data.connectedSheet}"`;
    }
  } catch (err) {
    console.error('Status fetch error:', err);
  }
}

// Fetch All Financial Data (Summary, Collections, Expenses)
async function fetchFinancialData {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '🔄  ...';
  }

  try {
    await Promise.all([
      fetchSummary,
      fetchCollections,
      fetchExpenses,
      fetchSystemStatus
    ]);
    showToast('    ');
  } catch (err) {
    showToast('    : ' + err.message, 'error');
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Refresh (Refresh)';
    }
  }
}

// Fetch Summary (B6, D6, F6)
async function fetchSummary {
  const res = await fetch('/api/data/summary');
  const data = await res.json;
  if (data.success) {
    currentSummary = data.summary;
    renderSummary;
  }
}

function renderSummary {
  if (!currentSummary) return;

  document.getElementById('kpiTotalIncome').textContent = formatINR(currentSummary.totalIncome);
  document.getElementById('kpiIncomeSub').textContent = 
    `Target: ${formatINR(currentSummary.totalTarget)} | Pending: ${formatINR(currentSummary.pendingIncome)}`;

  document.getElementById('kpiTotalExpenses').textContent = formatINR(currentSummary.totalExpenses);
  document.getElementById('kpiExpenseSub').textContent = 
    `Budget: ${formatINR(currentSummary.totalBudget)} | Pending : ${formatINR(currentSummary.pendingExpenses)}`;

  document.getElementById('kpiNetBalance').textContent = formatINR(currentSummary.netBalance);
}

// Fetch Collections (Rows 11-17)
async function fetchCollections {
  const res = await fetch('/api/data/collections');
  const data = await res.json;
  if (data.success) {
    currentCollections = data.collections;
    renderCollections(data.totals);
  }
}

function renderCollections(totals) {
  const tbody = document.getElementById('collectionsTableBody');
  const tfoot = document.getElementById('collectionsTableFoot');
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'collector';

  if (!currentCollections.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">    ।</td></tr>';
    return;
  }

  tbody.innerHTML = currentCollections.map((item, idx) => `
    <tr>
      <td class="text-center font-semibold text-dim">${item.id || idx + 1}</td>
      <td class="font-semibold">${item.source}</td>
      <td class="text-right">${formatINR(item.target)}</td>
      <td class="text-right font-semibold" style="color: #34d399;">${formatINR(item.collected)}</td>
      <td class="text-right" style="color: ${item.pending > 0 ? '#f87171' : 'var(--text-dim)'};">${formatINR(item.pending)}</td>
      ${canEdit ? `
        <td class="text-center">
          <button class="btn btn-secondary btn-sm" onclick="openEditCollectionModal(${item.id})">
            ✏️ Edit
          </button>
        </td>
      ` : ''}
    </tr>
  `).join('');

  if (totals) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="2" class="text-right font-bold">  (Total Collections):</td>
        <td class="text-right">${formatINR(totals.target)}</td>
        <td class="text-right font-bold" style="color: #34d399;">${formatINR(totals.collected)}</td>
        <td class="text-right font-bold" style="color: ${totals.pending > 0 ? '#f87171' : 'inherit'};">${formatINR(totals.pending)}</td>
        ${canEdit ? '<td></td>' : ''}
      </tr>
    `;
  }
}

// Fetch Expenses (Rows 23-34)
async function fetchExpenses {
  const res = await fetch('/api/data/expenses');
  const data = await res.json;
  if (data.success) {
    currentExpenses = data.expenses;
    renderExpenses(data.totals);
  }
}

function renderExpenses(totals) {
  const tbody = document.getElementById('expensesTableBody');
  const tfoot = document.getElementById('expensesTableFoot');
  const canEdit = currentUser?.role === 'admin';

  if (!currentExpenses.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">    ।</td></tr>';
    return;
  }

  tbody.innerHTML = currentExpenses.map((item, idx) => `
    <tr>
      <td class="text-center font-semibold text-dim">${item.id || idx + 1}</td>
      <td class="font-semibold">${item.category}</td>
      <td class="text-right">${formatINR(item.estimated)}</td>
      <td class="text-right">${formatINR(item.advance)}</td>
      <td class="text-right font-semibold" style="color: #f87171;">${formatINR(item.paid)}</td>
      <td class="text-right" style="color: ${item.pending > 0 ? '#fbbf24' : 'var(--text-dim)'};">${formatINR(item.pending)}</td>
      ${canEdit ? `
        <td class="text-center">
          <button class="btn btn-secondary btn-sm" onclick="openEditExpenseModal(${item.id})">
            ✏️ Edit
          </button>
        </td>
      ` : ''}
    </tr>
  `).join('');

  if (totals) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="2" class="text-right font-bold">   (Total Expenses):</td>
        <td class="text-right">${formatINR(totals.estimated)}</td>
        <td class="text-right">${formatINR(totals.advance)}</td>
        <td class="text-right font-bold" style="color: #f87171;">${formatINR(totals.paid)}</td>
        <td class="text-right font-bold">${formatINR(totals.pending)}</td>
        ${canEdit ? '<td></td>' : ''}
      </tr>
    `;
  }
}

// Collection Modal Handlers
function openEditCollectionModal(id) {
  const item = currentCollections.find(c => c.id === id);
  if (!item) return;

  document.getElementById('editCollectionId').value = item.id;
  document.getElementById('editCollectionSource').value = item.source;
  document.getElementById('editCollectionTarget').value = item.target;
  document.getElementById('editCollectionCollected').value = item.collected;

  document.getElementById('collectionModal').style.display = 'flex';
}

async function submitCollectionUpdate(e) {
  e.preventDefault;
  const id = document.getElementById('editCollectionId').value;
  const target = document.getElementById('editCollectionTarget').value;
  const collected = document.getElementById('editCollectionCollected').value;
  const saveBtn = document.getElementById('saveCollectionBtn');

  saveBtn.disabled = true;
  saveBtn.textContent = ' ...';

  try {
    const res = await fetch('/api/data/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, target, collected })
    });
    const data = await res.json;
    if (res.ok && data.success) {
      showToast(data.message || '  ');
      closeModal('collectionModal');
      await fetchFinancialData;
    } else {
      showToast(data.error || '   ', 'error');
    }
  } catch (err) {
    showToast(' : ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾   (Save)';
  }
}

// Expense Modal Handlers
function openEditExpenseModal(id) {
  const item = currentExpenses.find(e => e.id === id);
  if (!item) return;

  document.getElementById('editExpenseId').value = item.id;
  document.getElementById('editExpenseCategory').value = item.category;
  document.getElementById('editExpenseEstimated').value = item.estimated;
  document.getElementById('editExpenseAdvance').value = item.advance;
  document.getElementById('editExpensePaid').value = item.paid;

  document.getElementById('expenseModal').style.display = 'flex';
}

async function submitExpenseUpdate(e) {
  e.preventDefault;
  const id = document.getElementById('editExpenseId').value;
  const estimated = document.getElementById('editExpenseEstimated').value;
  const advance = document.getElementById('editExpenseAdvance').value;
  const paid = document.getElementById('editExpensePaid').value;
  const saveBtn = document.getElementById('saveExpenseBtn');

  saveBtn.disabled = true;
  saveBtn.textContent = ' ...';

  try {
    const res = await fetch('/api/data/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estimated, advance, paid })
    });
    const data = await res.json;
    if (res.ok && data.success) {
      showToast(data.message || '  ');
      closeModal('expenseModal');
      await fetchFinancialData;
    } else {
      showToast(data.error || '   ', 'error');
    }
  } catch (err) {
    showToast(' : ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾   (Save)';
  }
}

// User Management (Admin Only)
async function fetchUsersList {
  if (currentUser?.role !== 'admin') return;

  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json;
    if (data.success) {
      renderUsersTable(data.users);
    }
  } catch (err) {
    showToast('    ', 'error');
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!users || !users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">  ।</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td class="font-semibold"><code>${u.username}</code></td>
      <td>${u.name || '-'}</td>
      <td>
        <select onchange="updateUserRole('${u.username}', this.value)" class="role-select" ${u.username === 'admin' ? 'disabled' : ''}>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="collector" ${u.role === 'collector' ? 'selected' : ''}>Collector</option>
          <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
        </select>
      </td>
      <td class="text-dim text-sm">${u.createdAt ? new Date(u.createdAt).toLocaleDateString : 'N/A'}</td>
      <td class="text-center">
        ${u.username !== 'admin' && u.username !== currentUser?.username ? `
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.username}')">
            🗑️  
          </button>
        ` : '<span class="text-dim text-xs">Protected</span>'}
      </td>
    </tr>
  `).join('');
}

function openCreateUserModal {
  document.getElementById('createUserForm').reset;
  document.getElementById('createUserModal').style.display = 'flex';
}

async function submitCreateUser(e) {
  e.preventDefault;
  const username = document.getElementById('newUsername').value.trim;
  const name = document.getElementById('newName').value.trim;
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;
  const saveBtn = document.getElementById('saveUserBtn');

  saveBtn.disabled = true;
  saveBtn.textContent = ' ...';

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, password, role })
    });
    const data = await res.json;
    if (res.ok && data.success) {
      showToast(` "${username}"  !`);
      closeModal('createUserModal');
      fetchUsersList;
    } else {
      showToast(data.error || '   ', 'error');
    }
  } catch (err) {
    showToast(' : ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '  (Create)';
  }
}

async function updateUserRole(username, role) {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    const data = await res.json;
    if (res.ok && data.success) {
      showToast(`"${username}"   "${role}"  ।`);
    } else {
      showToast(data.error || '   ', 'error');
      fetchUsersList;
    }
  } catch (err) {
    showToast(' : ' + err.message, 'error');
  }
}

async function deleteUser(username) {
  if (!confirm(`    "${username}"    ?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });
    const data = await res.json;
    if (res.ok && data.success) {
      showToast(` "${username}"   ।`);
      fetchUsersList;
    } else {
      showToast(data.error || '  ', 'error');
    }
  } catch (err) {
    showToast(' : ' + err.message, 'error');
  }
}

// Modal helper
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Logout
async function logout {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', async  => {
  await checkAuth;
  await fetchFinancialData;
});
