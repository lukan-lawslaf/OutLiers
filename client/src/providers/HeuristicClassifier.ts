import type { FileMeta, Analysis } from '../../../shared/schemas.js';

export class HeuristicClassifier {
  public static classify(file: FileMeta): Analysis {
    const nameLower = file.name.toLowerCase();
    const sizeMb = file.size / (1024 * 1024);

    // 1. High Priority KEEP patterns (Documents, taxes, passports, resumes, contracts)
    const keepRegex = /(resume|cv|tax|passport|invoice|contract|statement|deed|certificate|diploma|id_card)/i;
    if (keepRegex.test(nameLower)) {
      return {
        id: file.id,
        verdict: 'keep',
        confidence: 0.95,
        reason: 'Sensitive or critical document name detected',
        category: 'important_doc',
      };
    }

    // 2. High Priority JUNK patterns
    // Installers / executables / dmg / pkg / deb / rpm
    if (/\.(exe|msi|dmg|pkg|deb|rpm|iso|apk)$/i.test(nameLower) || /setup|installer/i.test(nameLower)) {
      return {
        id: file.id,
        verdict: 'junk',
        confidence: 0.92,
        reason: 'Outdated or disposable software installer',
        category: 'installer',
      };
    }

    // Duplicate indicator e.g. "file (1).pdf" or "file - Copy.zip"
    if (/\s*\(\d+\)\.[a-z0-9]+$/i.test(nameLower) || /copy\.[a-z0-9]+$/i.test(nameLower)) {
      return {
        id: file.id,
        verdict: 'junk',
        confidence: 0.88,
        reason: 'Numbered duplicate file naming pattern',
        category: 'duplicate',
      };
    }

    // Temporary logs / caches
    if (/\.(log|tmp|bak|swp|dump|trace|cache)$/i.test(nameLower)) {
      return {
        id: file.id,
        verdict: 'junk',
        confidence: 0.96,
        reason: 'Temporary cache or diagnostic log file',
        category: 'log_or_temp',
      };
    }

    // Old screen recordings or screenshots (> 6 months old or large)
    if (/screen\s*(recording|shot)/i.test(nameLower)) {
      if (sizeMb > 50) {
        return {
          id: file.id,
          verdict: 'junk',
          confidence: 0.85,
          reason: 'Heavy screen recording consuming quota',
          category: 'old_media',
        };
      }
      return {
        id: file.id,
        verdict: 'maybe',
        confidence: 0.7,
        reason: 'Screenshot asset; review if reference needed',
        category: 'old_media',
      };
    }

    // Massive forgotten archives (> 1 GB)
    if (/\.(zip|tar|gz|7z|rar|tgz)$/i.test(nameLower)) {
      if (sizeMb > 250) {
        return {
          id: file.id,
          verdict: 'junk',
          confidence: 0.82,
          reason: 'Massive archive taking substantial cloud quota',
          category: 'archive',
        };
      }
      return {
        id: file.id,
        verdict: 'maybe',
        confidence: 0.65,
        reason: 'Compressed archive container',
        category: 'archive',
      };
    }

    // Default by size and type
    if (sizeMb > 500) {
      return {
        id: file.id,
        verdict: 'junk',
        confidence: 0.75,
        reason: 'Very large file consuming over 500 MB',
        category: 'other',
      };
    }

    return {
      id: file.id,
      verdict: 'maybe',
      confidence: 0.6,
      reason: 'General file; please review contents',
      category: 'other',
    };
  }

  public static classifyBatch(files: FileMeta[]): Analysis[] {
    return files.map((f) => this.classify(f));
  }
}
