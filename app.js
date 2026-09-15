import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://bkbwrcdppwxlerxqaexf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OADM-EX8WeK__jHB8AAowA_xIDhcFvx';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

const roleAliases = {
    Admin: 'Administrator',
    Staff: 'Laboratory Staff',
    Requester: 'Requester',
    Student: 'Student'
};

const uiRoleMap = {
    Administrator: 'Admin',
    'Laboratory Staff': 'Staff',
    Requester: 'Requester',
    Student: 'Student'
};

const knownUserProfiles = {
    'admin@lab.edu.ph': {
        full_name: 'Maria Santos',
        role: 'Administrator',
        password: 'password123'
    },
    'staff@lab.edu.ph': {
        full_name: 'Rhea Santos',
        role: 'Laboratory Staff',
        password: 'password123'
    },
    'staff@lab.edu.ph.lab': {
        full_name: 'Rhea Santos',
        role: 'Laboratory Staff',
        password: 'password123'
    },
    'student@lab.edu.ph': {
        full_name: 'Alex Reyes',
        role: 'Student',
        password: 'password123'
    }
};

const fallbackEquipment = [
    { id: 'eq-101', tag: 'LAP-001', name: 'Dell Latitude 5520 Laptop', category: 'Computing', status: 'Available' },
    { id: 'eq-102', tag: 'PROJ-002', name: 'Epson Wireless Projector', category: 'Audio/Visual', status: 'Available' },
    { id: 'eq-103', tag: 'OSC-003', name: 'Tektronix Digital Oscilloscope', category: 'Electronics', status: 'Maintenance' },
    { id: 'eq-104', tag: 'MIC-004', name: 'Binocular Compound Microscope', category: 'Biology', status: 'Available' }
];

const fallbackRequests = [
    { id: 'req-201', equipmentId: 'eq-101', requesterId: 'u-req-02', requesterName: 'Juan Dela Cruz', status: 'Pending', createdAt: new Date().toLocaleTimeString() }
];

const fallbackAuditLogs = [
    { id: 'log-1', user: 'System', action: 'INIT', module: 'System', recordId: 'SYS-0', description: 'Database & Auth Client Initialized', timestamp: new Date().toLocaleTimeString() }
];

const state = {
    isAuthenticated: false,
    currentRole: 'Requester',
    currentRoleDb: 'Requester',
    currentUserId: null,
    currentUserName: '',
    currentUserEmail: '',
    equipment: [...fallbackEquipment],
    requests: [...fallbackRequests],
    auditLogs: [...fallbackAuditLogs]
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-reset-data').addEventListener('click', seedSampleData);

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetView = e.currentTarget.getAttribute('data-view');
            navigate(targetView, e.currentTarget);
        });
    });

    initializeApp();
});

async function initializeApp() {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
            console.info('Existing Supabase session detected. Showing the login screen for manual access control.');
        }
    } catch (error) {
        console.warn('Session restore unavailable:', error);
    }

    showAuthScreen();
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;

    if (!email || !password) {
        alert('Please enter both email and password.');
        return;
    }

    try {
        let data;

        const knownSession = getKnownLocalSession(email, password);
        if (knownSession) {
            data = { user: knownSession };
        } else {
            try {
                const signInResult = await supabase.auth.signInWithPassword({ email, password });
                data = signInResult.data;
            } catch (signInError) {
                console.warn('Sign-in unavailable, attempting auto-sign-up:', signInError);

                const signUpResult = await supabase.auth.signUp({ email, password });

                if (signUpResult.error) {
                    throw signUpResult.error;
                }

                data = signUpResult.data;
            }
        }

        if (!data?.user) {
            throw new Error('Supabase did not return a user after sign-in/sign-up.');
        }

        await hydrateSession(data.user, null, false);
    } catch (error) {
        console.error('Supabase sign-in failed:', error);
        alert('Unable to sign in. Verify the Supabase user exists and the password is correct.');
    }
}

function getKnownUserProfile(user) {
    const email = (user?.email || '').toLowerCase();
    return knownUserProfiles[email] || null;
}

function getKnownLocalSession(email, password) {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const account = knownUserProfiles[normalizedEmail];

    if (!account) {
        return null;
    }

    if (account.password !== password) {
        return null;
    }

    return {
        id: `local-${normalizedEmail.replace(/[^a-z0-9]/g, '-')}`,
        email: normalizedEmail,
        user_metadata: {
            full_name: account.full_name
        }
    };
}

async function hydrateSession(user, selectedRole, restoredSession) {
    try {
        let currentProfile = {
            id: user.id,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Lab User',
            role: roleAliases[selectedRole] || 'Requester'
        };

        const knownProfile = getKnownUserProfile(user);
        if (knownProfile) {
            currentProfile = {
                ...currentProfile,
                ...knownProfile,
                id: user.id
            };
        }

        if (!user.id?.startsWith('local-')) {
            try {
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                if (profileError && profileError.code !== 'PGRST116') {
                    throw profileError;
                }

                if (profile) {
                    currentProfile = {
                        ...profile,
                        ...(knownProfile || {}),
                        id: user.id
                    };
                }
            } catch (profileLookupError) {
                console.warn('Profile table unavailable or inaccessible; using authenticated user fallback profile:', profileLookupError);
            }
        }

        state.isAuthenticated = true;
        state.currentUserId = user.id;
        state.currentUserEmail = user.email;
        state.currentUserName = currentProfile.full_name || user.email;
        state.currentRole = uiRoleMap[currentProfile.role] || 'Requester';
        state.currentRoleDb = currentProfile.role;

        document.getElementById('conn-status').textContent = restoredSession
            ? 'Supabase session restored'
            : 'Session authenticated & sync active';
        document.getElementById('session-log').textContent = state.currentRoleDb.toUpperCase();

        await loadAllFromSupabase();
        showMainDashboard();
    } catch (error) {
        console.error('Unable to hydrate session from Supabase:', error);
        alert('Connected, but the profile data could not be loaded from the configured Supabase schema.');
        showAuthScreen();
    }
}

async function safeSupabaseSelect(tableName, query) {
    try {
        const result = await query;

        if (result?.error) {
            console.warn(`Ignoring ${tableName} query issue and continuing with local data:`, result.error);
            return [];
        }

        return result?.data || [];
    } catch (error) {
        console.warn(`Ignoring ${tableName} query failure and continuing with local data:`, error);
        return [];
    }
}

async function loadAllFromSupabase() {
    const [equipmentResult, requestsResult, profilesResult, auditResult] = await Promise.all([
        safeSupabaseSelect('equipment', supabase.from('equipment').select('*').order('created_at', { ascending: false })),
        safeSupabaseSelect('borrowing_requests', supabase.from('borrowing_requests').select('*').order('created_at', { ascending: false })),
        safeSupabaseSelect('profiles', supabase.from('profiles').select('*')),
        state.currentRole === 'Admin'
            ? safeSupabaseSelect('audit_logs', supabase.from('audit_logs').select('*').order('created_at', { ascending: false }))
            : []
    ]);

    const profiles = profilesResult || [];
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));

    const equipmentRows = equipmentResult || [];
    const requestsRows = requestsResult || [];
    const auditRows = auditResult || [];

    state.equipment = equipmentRows.length
        ? equipmentRows.map(row => ({
            id: row.id,
            tag: row.asset_tag || row.tag || '—',
            name: row.name,
            category: row.category || 'Uncategorized',
            status: row.status || 'Available',
            createdAt: formatDate(row.created_at)
        }))
        : (state.equipment.length ? state.equipment : [...fallbackEquipment]);

    state.requests = requestsRows.length
        ? requestsRows.map(row => ({
            id: row.id,
            equipmentId: row.equipment_id || row.equipmentId,
            requesterId: row.requester_id || row.requesterId,
            requesterName: profileMap.get(row.requester_id || row.requesterId)?.full_name || 'Unknown User',
            status: row.status || 'Pending',
            createdAt: formatDate(row.created_at || row.borrow_date),
            approverId: row.approver_id || row.approverId || null,
            approverName: profileMap.get(row.approver_id || row.approverId)?.full_name || 'Pending'
        }))
        : (state.requests.length ? state.requests : [...fallbackRequests]);

    state.auditLogs = auditRows.length
        ? auditRows.map(row => ({
            id: row.id,
            timestamp: formatDate(row.created_at),
            user: profileMap.get(row.user_id)?.full_name || 'System',
            action: row.action,
            module: row.module,
            recordId: row.record_id || row.recordId,
            description: row.description
        }))
        : (state.auditLogs.length ? state.auditLogs : [...fallbackAuditLogs]);

    renderAllViews();
}

async function handleLogout() {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.warn('Sign-out warning:', error);
    }

    state.isAuthenticated = false;
    state.currentRole = 'Requester';
    state.currentRoleDb = 'Requester';
    state.currentUserId = null;
    state.currentUserName = '';
    state.currentUserEmail = '';

    document.getElementById('session-log').textContent = 'SIGNED OUT';
    document.getElementById('conn-status').textContent = 'Session ended';

    showAuthScreen();
}

function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function showMainDashboard() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';

    document.getElementById('active-user-name').textContent = state.currentUserName;
    document.getElementById('active-user-role').textContent = state.currentRole;

    updateNavigation();
    renderAllViews();
}

function updateNavigation() {
    const role = state.currentRole;
    document.getElementById('nav-approvals').style.display = (role === 'Admin') ? 'block' : 'none';
    document.getElementById('nav-audit').style.display = (role === 'Admin') ? 'block' : 'none';
    document.getElementById('nav-operations').style.display = (role === 'Admin' || role === 'Staff') ? 'block' : 'none';

    navigate('catalog', document.querySelector('.nav-btn[data-view="catalog"]'));
}

function navigate(viewId, btnEl) {
    if ((viewId === 'approvals' || viewId === 'audit') && state.currentRole !== 'Admin') {
        alert('ACCESS DENIED: Only Administrators can open this view.');
        return;
    }

    document.querySelectorAll('.views-content').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`view-${viewId}`).classList.add('active');
    if (btnEl) btnEl.classList.add('active');
}

async function requestItem(equipId) {
    const equip = state.equipment.find(e => e.id === equipId);

    if (!equip || equip.status !== 'Available') {
        alert('BUSINESS RULE VIOLATION: Equipment unavailable.');
        return;
    }

    try {
        const { error } = await supabase
            .from('borrowing_requests')
            .insert([
                {
                    equipment_id: equip.id,
                    requester_id: state.currentUserId,
                    status: 'Pending'
                }
            ]);

        if (error) {
            throw error;
        }

        alert('Request submitted as PENDING.');
        await loadAllFromSupabase();
    } catch (error) {
        console.error('Request failed:', error);

        const localRequest = {
            id: `req-${Date.now()}`,
            equipmentId: equip.id,
            requesterId: state.currentUserId,
            requesterName: state.currentUserName,
            status: 'Pending',
            createdAt: new Date().toLocaleString(),
            approverId: null,
            approverName: 'Pending'
        };

        state.requests.unshift(localRequest);
        alert('Supabase table is unavailable, so the request was saved locally for this session.');
        renderAllViews();
    }
}

async function processApproval(reqId, approved) {
    const req = state.requests.find(r => r.id === reqId);

    if (state.currentRole !== 'Admin') {
        alert('BUSINESS RULE VIOLATION: Only Admin can approve.');
        return;
    }

    if (req && req.requesterId === state.currentUserId) {
        alert('BUSINESS RULE VIOLATION (BR-A4-02): Users cannot approve their own requests.');
        return;
    }

    try {
        const { error } = await supabase
            .from('borrowing_requests')
            .update({
                status: approved ? 'Approved' : 'Rejected',
                approver_id: state.currentUserId
            })
            .eq('id', reqId);

        if (error) {
            throw error;
        }

        await loadAllFromSupabase();
    } catch (error) {
        console.error('Approval update failed:', error);

        if (req) {
            req.status = approved ? 'Approved' : 'Rejected';
            req.approverId = state.currentUserId;
            req.approverName = state.currentUserName;
        }

        alert('Approval update could not sync to Supabase, so the workflow was updated locally.');
        renderAllViews();
    }
}

async function releaseItem(reqId) {
    try {
        const { error } = await supabase
            .from('borrowing_requests')
            .update({ status: 'Released' })
            .eq('id', reqId);

        if (error) {
            throw error;
        }

        await loadAllFromSupabase();
    } catch (error) {
        console.error('Release failed:', error);
        const req = state.requests.find(r => r.id === reqId);

        if (req) {
            req.status = 'Released';
        }

        alert('Release could not sync to Supabase, so the item was marked as released locally.');
        renderAllViews();
    }
}

async function returnItem(reqId) {
    try {
        const { error } = await supabase
            .from('borrowing_requests')
            .update({ status: 'Returned' })
            .eq('id', reqId);

        if (error) {
            throw error;
        }

        await loadAllFromSupabase();
    } catch (error) {
        console.error('Return failed:', error);
        const req = state.requests.find(r => r.id === reqId);

        if (req) {
            req.status = 'Returned';
        }

        alert('Return could not sync to Supabase, so the request was marked as returned locally.');
        renderAllViews();
    }
}

function seedSampleData() {
    if (state.isAuthenticated) {
        alert('Supabase is connected. Use the database data directly to reset the system state.');
        return;
    }

    state.equipment = [...fallbackEquipment];
    state.requests = [...fallbackRequests];
    state.auditLogs = [...fallbackAuditLogs];
    renderAllViews();
}

function renderAllViews() {
    const catTbody = document.getElementById('catalog-table');
    catTbody.innerHTML = state.equipment.map(e => `
        <tr>
            <td><strong>${e.tag}</strong></td>
            <td>${e.name}</td>
            <td>${e.category}</td>
            <td><span class="badge badge-${e.status.toLowerCase()}">${e.status}</span></td>
            <td>
                <button class="btn btn-primary btn-sm btn-req" data-id="${e.id}" ${e.status !== 'Available' ? 'disabled' : ''}>
                    Request Item
                </button>
            </td>
        </tr>
    `).join('');

    const reqTbody = document.getElementById('my-requests-table');
    const myReqs = state.currentRole === 'Requester'
        ? state.requests.filter(r => r.requesterId === state.currentUserId)
        : state.requests;

    reqTbody.innerHTML = myReqs.map(r => {
        const equip = state.equipment.find(e => e.id === r.equipmentId);
        return `
            <tr>
                <td>#${r.id}</td>
                <td><strong>${equip?.tag || ''}</strong></td>
                <td>${equip?.name || ''}</td>
                <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
                <td>${r.createdAt}</td>
            </tr>
        `;
    }).join('');

    const appTbody = document.getElementById('approvals-table');
    const pendingReqs = state.requests.filter(r => r.status === 'Pending');
    appTbody.innerHTML = pendingReqs.map(r => {
        const equip = state.equipment.find(e => e.id === r.equipmentId);
        const isSelf = r.requesterId === state.currentUserId;
        return `
            <tr>
                <td>#${r.id}</td>
                <td>${r.requesterName}</td>
                <td><strong>${equip?.tag}</strong> - ${equip?.name}</td>
                <td><span class="badge badge-pending">Pending</span></td>
                <td>${isSelf ? '<small style="color:var(--danger)">Self-Request Block</small>' : '<small style="color:var(--success)">Valid</small>'}</td>
                <td>
                    <button class="btn btn-success btn-sm btn-approve" data-id="${r.id}">Approve</button>
                    <button class="btn btn-danger btn-sm btn-reject" data-id="${r.id}">Reject</button>
                </td>
            </tr>
        `;
    }).join('');

    const opTbody = document.getElementById('operations-table');
    opTbody.innerHTML = state.requests.map(r => {
        const equip = state.equipment.find(e => e.id === r.equipmentId);
        return `
            <tr>
                <td>#${r.id}</td>
                <td>${r.requesterName}</td>
                <td><strong>${equip?.tag}</strong></td>
                <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm btn-release" data-id="${r.id}" ${r.status !== 'Approved' ? 'disabled' : ''}>Release Item</button>
                    <button class="btn btn-secondary btn-sm btn-return" data-id="${r.id}" ${r.status !== 'Released' ? 'disabled' : ''}>Process Return</button>
                </td>
            </tr>
        `;
    }).join('');

    const auditTbody = document.getElementById('audit-table');
    auditTbody.innerHTML = state.auditLogs.map(l => `
        <tr>
            <td><small>${l.timestamp}</small></td>
            <td><strong>${l.user}</strong></td>
            <td><span class="badge badge-approved">${l.action}</span></td>
            <td>${l.module}</td>
            <td><code>#${l.recordId}</code></td>
            <td>${l.description}</td>
        </tr>
    `).join('');

    document.querySelectorAll('.btn-req').forEach(b => b.onclick = () => requestItem(b.dataset.id));
    document.querySelectorAll('.btn-approve').forEach(b => b.onclick = () => processApproval(b.dataset.id, true));
    document.querySelectorAll('.btn-reject').forEach(b => b.onclick = () => processApproval(b.dataset.id, false));
    document.querySelectorAll('.btn-release').forEach(b => b.onclick = () => releaseItem(b.dataset.id));
    document.querySelectorAll('.btn-return').forEach(b => b.onclick = () => returnItem(b.dataset.id));
}

function formatDate(value) {
    if (!value) return '—';

    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

function addAuditLog(action, module, recordId, description) {
    state.auditLogs.unshift({
        id: `log-${state.auditLogs.length + 1}`,
        timestamp: new Date().toLocaleTimeString(),
        user: state.currentUserName,
        action: action,
        module: module,
        recordId: recordId,
        description: description
    });
}