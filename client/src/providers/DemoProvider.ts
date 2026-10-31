import type { FileMeta, TrashResult, RestoreResult } from '../../../shared/schemas.js';
import type { FileProvider } from '../../../shared/types.js';

export const SEEDED_DEMO_FILES: FileMeta[] = [
  // Installers & Packages (Junk)
  { id: 'f-inst-01', name: 'node-v20.11.0-x64.msi', mimeType: 'application/x-msi', size: 32_400_000, modifiedTime: '2023-11-10T10:00:00Z', viewedByMeTime: '2023-11-10T10:05:00Z' },
  { id: 'f-inst-02', name: 'docker-desktop-installer-4.22.exe', mimeType: 'application/x-msdos-program', size: 540_000_000, modifiedTime: '2023-08-15T14:20:00Z' },
  { id: 'f-inst-03', name: 'Postman-win64-10.18.0-Setup.exe', mimeType: 'application/x-msdos-program', size: 165_000_000, modifiedTime: '2023-09-01T09:12:00Z' },
  { id: 'f-inst-04', name: 'VirtualBox-7.0.10-Win.exe', mimeType: 'application/x-msdos-program', size: 110_000_000, modifiedTime: '2023-07-22T16:30:00Z' },
  { id: 'f-inst-05', name: 'AndroidStudio-2023.2.1-windows.exe', mimeType: 'application/x-msdos-program', size: 1_120_000_000, modifiedTime: '2023-05-19T11:45:00Z' },
  { id: 'f-inst-06', name: 'Git-2.42.0.2-64-bit.exe', mimeType: 'application/x-msdos-program', size: 58_000_000, modifiedTime: '2023-10-04T08:10:00Z' },
  { id: 'f-inst-07', name: 'MongoDB-Compass-1.40.4.exe', mimeType: 'application/x-msdos-program', size: 125_000_000, modifiedTime: '2023-11-12T13:00:00Z' },
  { id: 'f-inst-08', name: 'SlackSetup-4.34.121.exe', mimeType: 'application/x-msdos-program', size: 89_000_000, modifiedTime: '2023-10-25T17:15:00Z' },

  // Numbered Duplicates (Junk)
  { id: 'f-dup-01', name: 'Quarterly_Financial_Report (1).pdf', mimeType: 'application/pdf', size: 14_500_000, modifiedTime: '2023-12-01T15:20:00Z' },
  { id: 'f-dup-02', name: 'Client_Pitch_Deck_v4 (2).pdf', mimeType: 'application/pdf', size: 48_000_000, modifiedTime: '2023-11-20T10:10:00Z' },
  { id: 'f-dup-03', name: 'Architectural_Render_Export (1).zip', mimeType: 'application/zip', size: 320_000_000, modifiedTime: '2023-09-18T18:40:00Z' },
  { id: 'f-dup-04', name: 'Database_Backup_20231015 (1).sql', mimeType: 'application/sql', size: 185_000_000, modifiedTime: '2023-10-15T02:00:00Z' },
  { id: 'f-dup-05', name: 'Brand_Assets_Pack (Copy).zip', mimeType: 'application/zip', size: 210_000_000, modifiedTime: '2023-08-30T12:00:00Z' },
  { id: 'f-dup-06', name: 'Project_Proposal_Signed (1).docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 8_200_000, modifiedTime: '2023-10-10T14:30:00Z' },

  // Bloated Media & Screen Recordings (Junk / Maybe)
  { id: 'f-med-01', name: 'Screen Recording 2023-06-14 at 3.42.11 PM.mov', mimeType: 'video/quicktime', size: 850_000_000, modifiedTime: '2023-06-14T15:45:00Z' },
  { id: 'f-med-02', name: 'Zoom_Meeting_Recording_Uncut_2hr.mp4', mimeType: 'video/mp4', size: 1_840_000_000, modifiedTime: '2023-04-12T18:00:00Z' },
  { id: 'f-med-03', name: 'Screen Recording 2023-09-22 at 11.15.00 AM.mov', mimeType: 'video/quicktime', size: 420_000_000, modifiedTime: '2023-09-22T11:20:00Z' },
  { id: 'f-med-04', name: 'Demo_Walkthrough_RAW_take2.mov', mimeType: 'video/quicktime', size: 690_000_000, modifiedTime: '2023-07-08T19:30:00Z' },
  { id: 'f-med-05', name: 'Podcast_Episode_12_Stems.zip', mimeType: 'application/zip', size: 950_000_000, modifiedTime: '2023-05-02T13:10:00Z' },
  { id: 'f-med-06', name: 'GoPro_HERO8_BikeRide_0012.mp4', mimeType: 'video/mp4', size: 2_450_000_000, modifiedTime: '2023-03-19T10:00:00Z' },

  // Chaotic Version Names (Junk / Maybe)
  { id: 'f-ver-01', name: 'Thesis_Final_v7_FINAL_really_final.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 35_000_000, modifiedTime: '2023-05-15T23:59:00Z' },
  { id: 'f-ver-02', name: 'PitchDeck_v12_Revised_FeedbackApplied_v2.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 62_000_000, modifiedTime: '2023-08-20T16:00:00Z' },
  { id: 'f-ver-03', name: 'Budget_2023_Draft_OLD_DO_NOT_USE.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 12_000_000, modifiedTime: '2023-02-14T09:30:00Z' },

  // Caches & Temporary Files (Junk)
  { id: 'f-tmp-01', name: 'production_debug_dump_20231101.log', mimeType: 'text/plain', size: 78_000_000, modifiedTime: '2023-11-01T04:12:00Z' },
  { id: 'f-tmp-02', name: 'npm_cache_archive.tar.gz', mimeType: 'application/gzip', size: 340_000_000, modifiedTime: '2023-06-20T11:00:00Z' },
  { id: 'f-tmp-03', name: 'core_dump_process_8192.dmp', mimeType: 'application/octet-stream', size: 520_000_000, modifiedTime: '2023-08-11T14:40:00Z' },

  // Crucial Documents (KEEP - Should trigger Shield & Confirmation!)
  { id: 'f-keep-01', name: 'Official_Resume_2026.pdf', mimeType: 'application/pdf', size: 1_200_000, modifiedTime: '2024-01-10T12:00:00Z', viewedByMeTime: '2024-01-15T10:00:00Z' },
  { id: 'f-keep-02', name: 'Tax_Return_Form_1040_2025.pdf', mimeType: 'application/pdf', size: 4_500_000, modifiedTime: '2024-02-18T16:20:00Z' },
  { id: 'f-keep-03', name: 'Passport_Scan_Color_Verified.pdf', mimeType: 'application/pdf', size: 3_800_000, modifiedTime: '2023-12-05T09:10:00Z' },
  { id: 'f-keep-04', name: 'Apartment_Lease_Agreement_Signed.pdf', mimeType: 'application/pdf', size: 2_900_000, modifiedTime: '2023-09-01T11:30:00Z' },
  { id: 'f-keep-05', name: 'Medical_Insurance_Card_and_Records.pdf', mimeType: 'application/pdf', size: 5_100_000, modifiedTime: '2023-11-28T14:00:00Z' },
  { id: 'f-keep-06', name: 'Employment_Offer_Letter_Countersigned.pdf', mimeType: 'application/pdf', size: 1_800_000, modifiedTime: '2023-10-15T15:45:00Z' },

  // Ambiguous / Maybe files
  { id: 'f-may-01', name: 'Conference_Notes_Oct2023.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 6_400_000, modifiedTime: '2023-10-28T17:00:00Z' },
  { id: 'f-may-02', name: 'User_Research_Interviews_Summary.pdf', mimeType: 'application/pdf', size: 18_000_000, modifiedTime: '2023-07-15T12:00:00Z' },
  { id: 'f-may-03', name: 'Whitepaper_Competitive_Landscape.pdf', mimeType: 'application/pdf', size: 22_000_000, modifiedTime: '2023-08-04T10:30:00Z' },
  { id: 'f-may-04', name: 'Dataset_Census_Export_Cleaned.csv', mimeType: 'text/csv', size: 45_000_000, modifiedTime: '2023-06-30T14:10:00Z' },
  { id: 'f-may-05', name: 'Marketing_Campaign_Photos_Batch1.zip', mimeType: 'application/zip', size: 180_000_000, modifiedTime: '2023-09-10T16:20:00Z' },
];

export class DemoProvider implements FileProvider {
  public readonly mode = 'demo' as const;
  private files: Map<string, FileMeta>;
  private trashedSet: Set<string> = new Set();

  constructor(initialFiles: FileMeta[] = SEEDED_DEMO_FILES) {
    this.files = new Map(initialFiles.map((f) => [f.id, { ...f }]));
  }

  public async listCandidates(): Promise<FileMeta[]> {
    return Array.from(this.files.values()).filter((f) => !this.trashedSet.has(f.id));
  }

  public async trash(ids: string[]): Promise<TrashResult[]> {
    const results: TrashResult[] = [];
    for (const id of ids) {
      const file = this.files.get(id);
      if (!file) {
        results.push({ id, success: false, error: 'File not found' });
      } else {
        this.trashedSet.add(id);
        results.push({ id, success: true, bytesFreed: file.size });
      }
    }
    return results;
  }

  public async restore(ids: string[]): Promise<RestoreResult[]> {
    const results: RestoreResult[] = [];
    for (const id of ids) {
      if (!this.files.has(id)) {
        results.push({ id, success: false, error: 'File not found' });
      } else {
        this.trashedSet.delete(id);
        results.push({ id, success: true });
      }
    }
    return results;
  }
}
