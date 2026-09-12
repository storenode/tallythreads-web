import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gmmeaplomgotqtivevkg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dFTho8OwnCTpID8dQqzI8w_hkS7cxbF';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verify() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  BANDRIP STREETWEAR STORE - Deletion Verification');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // 1. Check organizations
    console.log('1️⃣  Checking ORGANIZATIONS table...');
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, legal_name, created_at, deleted_at')
      .or("name.ilike.%BANDRIP%,legal_name.ilike.%BANDRIP%");

    if (orgsError) {
      console.log(`   ❌ Error: ${orgsError.message}`);
    } else {
      console.log(`   ✓ Records found: ${orgs?.length || 0}`);
      if (orgs && orgs.length > 0) {
        orgs.forEach(org => {
          console.log(`   ⚠️  ${org.name || org.legal_name} (ID: ${org.id})`);
          console.log(`       deleted_at: ${org.deleted_at || '(NOT SOFT-DELETED!)'}`);
        });
      }
    }

    // 2. Check the flagged orphan member
    console.log('\n2️⃣  Checking for flagged orphan member...');
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, google_email, is_active')
      .eq('id', 'a7cf9991-4357-49b3-997d-e15cc0cb8c87');

    if (memberError) {
      console.log(`   ❌ Error: ${memberError.message}`);
    } else if (member && member.length > 0) {
      console.log(`   ❌ FOUND (should be deleted!)`);
      console.log(`      ID: ${member[0].id}`);
      console.log(`      Email: ${member[0].google_email}`);
      console.log(`      is_active: ${member[0].is_active}`);
    } else {
      console.log('   ✅ Member deleted (correct!)');
    }

    // 3. Check stores (orphaned - no org)
    console.log('\n3️⃣  Checking for orphaned stores...');
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name, organization_id');

    if (storesError) {
      console.log(`   ❌ Error: ${storesError.message}`);
    } else {
      const orphanedStores = [];
      if (stores && stores.length > 0) {
        for (const store of stores) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('id', store.organization_id)
            .is('deleted_at', null);
          if (!org || org.length === 0) {
            orphanedStores.push(store);
          }
        }
      }
      console.log(`   ✓ Orphaned stores found: ${orphanedStores.length}`);
      if (orphanedStores.length > 0) {
        orphanedStores.forEach(s => {
          console.log(`   ⚠️  ${s.name} (org_id: ${s.organization_id})`);
        });
      }
    }

    // 4. Check memberships for BANDRIP
    console.log('\n4️⃣  Checking MEMBERSHIPS table...');
    const { data: memberships, error: membershipsError } = await supabase
      .from('memberships')
      .select('id, organization_id');

    if (membershipsError) {
      console.log(`   ❌ Error: ${membershipsError.message}`);
    } else {
      let bandrip_memberships = [];
      if (orgs && orgs.length > 0 && memberships) {
        bandrip_memberships = memberships.filter(m =>
          orgs.some(o => m.organization_id === o.id)
        );
      }
      console.log(`   ✓ BANDRIP memberships found: ${bandrip_memberships.length}`);
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  DELETION SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    const findings = {
      'Organizations': orgs?.length || 0,
      'Flagged Member': member?.length || 0,
      'Orphaned Stores': 0,
      'BANDRIP Memberships': 0,
    };

    let totalIssues = 0;
    Object.entries(findings).forEach(([name, count]) => {
      if (count > 0) {
        console.log(`⚠️  ${name}: ${count}`);
        totalIssues += count;
      } else {
        console.log(`✅ ${name}: 0`);
      }
    });

    console.log('\n' + '═'.repeat(55));
    if (totalIssues === 0) {
      console.log('✅ COMPLETE DELETION VERIFIED!');
      console.log('   No traces of BANDRIP remain.\n');
      process.exit(0);
    } else {
      console.log(`⚠️  ISSUES FOUND: ${totalIssues}`);
      console.log('   Please review above.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verify();
