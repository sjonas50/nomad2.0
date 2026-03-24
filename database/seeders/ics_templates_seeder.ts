import { BaseSeeder } from '@adonisjs/lucid/seeders'
import PromptTemplate from '#models/prompt_template'

export default class extends BaseSeeder {
  async run() {
    const templates = [
      // ICS Templates
      {
        slug: 'ics-211-par',
        category: 'ics',
        name: 'Personnel Accountability Report (ICS-211)',
        template: `# Personnel Accountability Report (PAR)
Incident: {{incident_name}}
Period: {{iap_period}}
Date/Time: {{timestamp}}

## Check-In Roster
| Name | Role | Status | Location | Check-In Method | Time |
|------|------|--------|----------|-----------------|------|
{{personnel_rows}}

## Summary
- Total Personnel: {{total}}
- Available: {{available}}
- Deployed: {{deployed}}
- Injured: {{injured}}
- Unaccounted: {{unaccounted}}

## Notes
{{notes}}`,
        variables: ['incident_name', 'iap_period', 'timestamp', 'personnel_rows', 'total', 'available', 'deployed', 'injured', 'unaccounted', 'notes'],
      },
      {
        slug: 'ics-213rr-resource-request',
        category: 'ics',
        name: 'Resource Request (ICS-213RR)',
        template: `# Resource Request (ICS-213RR)
Incident: {{incident_name}}
Date/Time: {{timestamp}}
Requested By: {{requester}}

## Request Details
Resource Type: {{resource_type}}
Quantity: {{quantity}}
Priority: {{priority}}

## Justification
{{justification}}

## Delivery Details
Needed By: {{needed_by}}
Delivery Location: {{delivery_location}}
Special Instructions: {{special_instructions}}`,
        variables: ['incident_name', 'timestamp', 'requester', 'resource_type', 'quantity', 'priority', 'justification', 'needed_by', 'delivery_location', 'special_instructions'],
      },
      {
        slug: 'ics-214-activity-log',
        category: 'ics',
        name: 'Activity Log (ICS-214)',
        template: `# Activity Log (ICS-214)
Incident: {{incident_name}}
Operational Period: {{iap_period}}
Name: {{operator_name}}
Position: {{position}}

## Activity Log
| Time | Activity | Category |
|------|----------|----------|
{{activity_rows}}

## Prepared By
Name: {{operator_name}}
Date/Time: {{timestamp}}`,
        variables: ['incident_name', 'iap_period', 'operator_name', 'position', 'activity_rows', 'timestamp'],
      },
      {
        slug: 'ics-pace-plan',
        category: 'ics',
        name: 'PACE Communication Plan',
        template: `# PACE Communication Plan
Incident: {{incident_name}}
Date: {{timestamp}}

## Communication Methods (Priority Order)

### Primary
Method: {{primary_method}}
Details: {{primary_details}}
Frequencies/Channels: {{primary_freq}}

### Alternate
Method: {{alternate_method}}
Details: {{alternate_details}}
Frequencies/Channels: {{alternate_freq}}

### Contingency
Method: {{contingency_method}}
Details: {{contingency_details}}
Frequencies/Channels: {{contingency_freq}}

### Emergency
Method: {{emergency_method}}
Details: {{emergency_details}}
Frequencies/Channels: {{emergency_freq}}

## Check-In Schedule
{{check_in_schedule}}

## Notes
{{notes}}`,
        variables: ['incident_name', 'timestamp', 'primary_method', 'primary_details', 'primary_freq', 'alternate_method', 'alternate_details', 'alternate_freq', 'contingency_method', 'contingency_details', 'contingency_freq', 'emergency_method', 'emergency_details', 'emergency_freq', 'check_in_schedule', 'notes'],
      },
      {
        slug: 'ics-emergency-comms',
        category: 'ics',
        name: 'Emergency Communications Quick Reference',
        template: `# Emergency Communications Quick Reference
Last Updated: {{timestamp}}

## Radio Frequencies
{{radio_frequencies}}

## Meshtastic Channels
{{mesh_channels}}

## Key Contacts
{{key_contacts}}

## Distress Protocols
{{distress_protocols}}`,
        variables: ['timestamp', 'radio_frequencies', 'mesh_channels', 'key_contacts', 'distress_protocols'],
      },

      // BCP Templates
      {
        slug: 'bcp-impact-analysis',
        category: 'bcp',
        name: 'Business Impact Analysis',
        template: `# Business Impact Analysis
Organization: {{org_name}}
Date: {{timestamp}}
Prepared By: {{preparer}}

## Critical Business Functions
| Function | Priority | RTO (hours) | RPO (hours) | Dependencies | Impact if Lost |
|----------|----------|-------------|-------------|--------------|----------------|
{{function_rows}}

## Key Dependencies
### Technology
{{tech_dependencies}}

### Personnel
{{personnel_dependencies}}

### Facilities
{{facility_dependencies}}

## Financial Impact Estimate
{{financial_impact}}

## Recovery Priority Matrix
1. {{priority_1}}
2. {{priority_2}}
3. {{priority_3}}`,
        variables: ['org_name', 'timestamp', 'preparer', 'function_rows', 'tech_dependencies', 'personnel_dependencies', 'facility_dependencies', 'financial_impact', 'priority_1', 'priority_2', 'priority_3'],
      },
      {
        slug: 'bcp-recovery-matrix',
        category: 'bcp',
        name: 'Recovery Priority Matrix',
        template: `# Recovery Priority Matrix
Incident: {{incident_name}}
Date: {{timestamp}}

## Tier 1 — Restore Within 4 Hours
{{tier_1_functions}}

## Tier 2 — Restore Within 24 Hours
{{tier_2_functions}}

## Tier 3 — Restore Within 72 Hours
{{tier_3_functions}}

## Recovery Steps
{{recovery_steps}}

## Workarounds for Degraded Functions
{{workarounds}}`,
        variables: ['incident_name', 'timestamp', 'tier_1_functions', 'tier_2_functions', 'tier_3_functions', 'recovery_steps', 'workarounds'],
      },
      {
        slug: 'bcp-communication-cascade',
        category: 'bcp',
        name: 'Communication Cascade Plan',
        template: `# Communication Cascade Plan
Organization: {{org_name}}
Activation Trigger: {{trigger}}

## Notification Tiers
### Tier 1 — Executive Leadership (within 15 min)
{{tier_1_contacts}}

### Tier 2 — Department Heads (within 30 min)
{{tier_2_contacts}}

### Tier 3 — All Staff (within 60 min)
{{tier_3_contacts}}

## Message Templates
### Initial Notification
{{initial_message}}

### Status Update
{{status_update_message}}

### All-Clear
{{all_clear_message}}

## Communication Channels (Priority Order)
{{channel_priority}}`,
        variables: ['org_name', 'trigger', 'tier_1_contacts', 'tier_2_contacts', 'tier_3_contacts', 'initial_message', 'status_update_message', 'all_clear_message', 'channel_priority'],
      },
      {
        slug: 'bcp-it-disaster-recovery',
        category: 'bcp',
        name: 'IT Disaster Recovery Checklist',
        template: `# IT Disaster Recovery Checklist
Incident: {{incident_name}}
Date: {{timestamp}}

## Immediate Actions (0-4 hours)
- [ ] Assess damage scope
- [ ] Activate backup power/UPS
- [ ] Verify data backups are accessible
- [ ] Notify IT recovery team
- [ ] Begin incident documentation

## Short-Term Recovery (4-24 hours)
- [ ] Restore critical databases from backup
- [ ] Bring up core network services
- [ ] Verify communication systems (email, chat, radio)
- [ ] Restore authentication services
- [ ] Enable remote access if facility compromised

## Medium-Term Recovery (24-72 hours)
- [ ] Restore non-critical systems
- [ ] Verify data integrity
- [ ] Resume normal backup schedules
- [ ] Document lessons learned

## Systems Inventory
{{systems_inventory}}

## Backup Locations
{{backup_locations}}

## Vendor Contacts
{{vendor_contacts}}`,
        variables: ['incident_name', 'timestamp', 'systems_inventory', 'backup_locations', 'vendor_contacts'],
      },
    ]

    for (const t of templates) {
      const existing = await PromptTemplate.query().where('slug', t.slug).first()
      if (!existing) {
        await PromptTemplate.create({
          slug: t.slug,
          category: t.category,
          name: t.name,
          template: t.template,
          variables: t.variables,
          version: 1,
          isActive: true,
        })
      }
    }
  }
}
