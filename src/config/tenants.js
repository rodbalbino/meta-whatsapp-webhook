// src/config/tenants.js

const TENANTS = {
  digitalwolk: {
    id: 'digitalwolk',
    displayName: 'Digitalwolk',
    phoneNumberId: process.env.DIGITALWOLK_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || null,
  },
  jaspers: {
    id: 'jaspers',
    displayName: "Jasper's Market",
    phoneNumberId: process.env.JASPERS_PHONE_NUMBER_ID || null,
  },
};

function buildIndex() {
  const idx = new Map();
  for (const tenant of Object.values(TENANTS)) {
    if (!tenant.phoneNumberId) continue;
    idx.set(String(tenant.phoneNumberId), tenant.id);
  }
  return idx;
}

let phoneToTenant = buildIndex();

function refreshTenantIndex() {
  phoneToTenant = buildIndex();
}

function resolveTenantIdByPhoneNumberId(phoneNumberId) {
  if (phoneNumberId && phoneToTenant.has(String(phoneNumberId))) {
    return phoneToTenant.get(String(phoneNumberId));
  }

  const tenantIds = Object.keys(TENANTS);
  if (tenantIds.length === 1) return tenantIds[0];

  return null;
}

module.exports = {
  TENANTS,
  refreshTenantIndex,
  resolveTenantIdByPhoneNumberId,
};
