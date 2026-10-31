import type { DataTable } from '../shared/contracts.js';
import { makeTable } from './imports.js';
export function demoTables(name: 'market' | 'club'): DataTable[] {
  if (name === 'club') return [
    makeTable('Garden club members', [['member_id', 'member_name', 'plot'], ['M01', 'Fern Fox', 'North'], ['M02', 'Moss Reed', 'South'], ['M03', 'moss reed', 'East'], ['M04', 'Ada Bloom', 'West'], ['M04', 'Ada Bloom', 'West']]),
    makeTable('Workshop registrations', [['registration_id', 'member_id', 'workshop'], ['R01', 'M01', 'Seed saving'], ['R02', 'm02', 'Composting'], ['R03', 'M03', 'Seed saving'], ['R04', 'M99', 'Pruning']]),
  ];
  return [
    makeTable('Market customers', [['customer_id', 'customer_name', 'neighborhood'], ['C01', 'Hazel Finch', 'Willow Lane'], ['C02', 'Milo Moss', 'Orchard Hill'], ['C03', 'milo moss', 'Brook Street'], ['C04', 'Nora Pine', 'Market Square'], ['C04', 'Nora Pine', 'Market Square']]),
    makeTable('Market orders', [['order_id', 'customer_id', 'total'], ['O01', 'C01', 24], ['O02', 'c02', 18], ['O03', 'C03', 32], ['O04', 'C99', 12]]),
  ];
}
