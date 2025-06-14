import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface QueryPerformanceMetrics {
  slowQueries: Array<{
    query: string;
    calls: number;
    totalTime: number;
    meanTime: number;
    maxTime: number;
  }>;
  indexUsage: Array<{
    tableName: string;
    indexName: string;
    scans: number;
    tuplesRead: number;
    tuplesReturned: number;
    efficiency: number;
  }>;
  tableStats: Array<{
    tableName: string;
    rowCount: number;
    tableSize: string;
    indexSize: string;
    totalSize: string;
    lastAnalyze: Date | null;
    lastVacuum: Date | null;
  }>;
  connectionStats: {
    active: number;
    idle: number;
    total: number;
    maxConnections: number;
  };
}

export interface DatabaseHealthMetrics {
  diskUsage: {
    total: string;
    used: string;
    available: string;
    percentage: number;
  };
  cacheHitRatio: number;
  deadlocks: number;
  longRunningQueries: number;
  blockedQueries: number;
  indexBloat: Array<{
    tableName: string;
    indexName: string;
    bloatRatio: number;
    wastedBytes: string;
  }>;
}

export class DatabaseOptimizationService {
  /**
   * Get comprehensive database performance metrics
   */
  async getPerformanceMetrics(): Promise<QueryPerformanceMetrics> {
    try {
      const [slowQueries, indexUsage, tableStats, connectionStats] = await Promise.all([
        this.getSlowQueries(),
        this.getIndexUsageStats(),
        this.getTableStats(),
        this.getConnectionStats(),
      ]);

      return {
        slowQueries,
        indexUsage,
        tableStats,
        connectionStats,
      };
    } catch (error) {
      logger.error('Failed to get database performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get database health metrics
   */
  async getHealthMetrics(): Promise<DatabaseHealthMetrics> {
    try {
      const [diskUsage, cacheHitRatio, deadlocks, longRunningQueries, blockedQueries, indexBloat] =
        await Promise.all([
          this.getDiskUsage(),
          this.getCacheHitRatio(),
          this.getDeadlockCount(),
          this.getLongRunningQueryCount(),
          this.getBlockedQueryCount(),
          this.getIndexBloat(),
        ]);

      return {
        diskUsage,
        cacheHitRatio,
        deadlocks,
        longRunningQueries,
        blockedQueries,
        indexBloat,
      };
    } catch (error) {
      logger.error('Failed to get database health metrics:', error);
      throw error;
    }
  }

  /**
   * Get slow query statistics
   */
  private async getSlowQueries(): Promise<QueryPerformanceMetrics['slowQueries']> {
    try {
      // Check if pg_stat_statements extension is available
      const extensionCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
        ) as exists;
      `;

      if (!extensionCheck[0]?.exists) {
        logger.warn('pg_stat_statements extension not available, skipping slow query analysis');
        return [];
      }

      const slowQueries = await prisma.$queryRaw<Array<{
        query: string;
        calls: bigint;
        total_time: number;
        mean_time: number;
        max_time: number;
      }>>`
        SELECT 
          query,
          calls,
          total_exec_time as total_time,
          mean_exec_time as mean_time,
          max_exec_time as max_time
        FROM pg_stat_statements 
        WHERE mean_exec_time > 100 -- queries slower than 100ms
        ORDER BY mean_exec_time DESC 
        LIMIT 20;
      `;

      return slowQueries.map(q => ({
        query: q.query.substring(0, 200) + (q.query.length > 200 ? '...' : ''),
        calls: Number(q.calls),
        totalTime: Number(q.total_time),
        meanTime: Number(q.mean_time),
        maxTime: Number(q.max_time),
      }));
    } catch (error) {
      logger.warn('Failed to get slow queries:', error);
      return [];
    }
  }

  /**
   * Get index usage statistics
   */
  private async getIndexUsageStats(): Promise<QueryPerformanceMetrics['indexUsage']> {
    try {
      const indexStats = await prisma.$queryRaw<Array<{
        table_name: string;
        index_name: string;
        idx_scan: bigint;
        idx_tup_read: bigint;
        idx_tup_fetch: bigint;
      }>>`
        SELECT 
          schemaname as schema_name,
          tablename as table_name,
          indexname as index_name,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC;
      `;

      return indexStats.map(stat => ({
        tableName: stat.table_name,
        indexName: stat.index_name,
        scans: Number(stat.idx_scan),
        tuplesRead: Number(stat.idx_tup_read),
        tuplesReturned: Number(stat.idx_tup_fetch),
        efficiency: Number(stat.idx_tup_read) > 0 
          ? (Number(stat.idx_tup_fetch) / Number(stat.idx_tup_read)) * 100 
          : 0,
      }));
    } catch (error) {
      logger.error('Failed to get index usage stats:', error);
      return [];
    }
  }

  /**
   * Get table statistics including size and maintenance info
   */
  private async getTableStats(): Promise<QueryPerformanceMetrics['tableStats']> {
    try {
      const tableStats = await prisma.$queryRaw<Array<{
        table_name: string;
        row_estimate: bigint;
        table_size: string;
        index_size: string;
        total_size: string;
        last_analyze: Date | null;
        last_vacuum: Date | null;
      }>>`
        SELECT 
          t.table_name,
          c.reltuples::BIGINT as row_estimate,
          pg_size_pretty(pg_total_relation_size(c.oid)) as table_size,
          pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
          pg_size_pretty(pg_total_relation_size(c.oid) + pg_indexes_size(c.oid)) as total_size,
          s.last_analyze,
          s.last_vacuum
        FROM information_schema.tables t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
        WHERE t.table_schema = 'public' 
          AND t.table_type = 'BASE TABLE'
          AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC;
      `;

      return tableStats.map(stat => ({
        tableName: stat.table_name,
        rowCount: Number(stat.row_estimate),
        tableSize: stat.table_size,
        indexSize: stat.index_size,
        totalSize: stat.total_size,
        lastAnalyze: stat.last_analyze,
        lastVacuum: stat.last_vacuum,
      }));
    } catch (error) {
      logger.error('Failed to get table stats:', error);
      return [];
    }
  }

  /**
   * Get database connection statistics
   */
  private async getConnectionStats(): Promise<QueryPerformanceMetrics['connectionStats']> {
    try {
      const [connectionCounts, maxConnections] = await Promise.all([
        prisma.$queryRaw<Array<{
          state: string;
          count: bigint;
        }>>`
          SELECT state, count(*) as count
          FROM pg_stat_activity 
          WHERE datname = current_database()
          GROUP BY state;
        `,
        prisma.$queryRaw<Array<{
          max_connections: number;
        }>>`
          SELECT setting::int as max_connections 
          FROM pg_settings 
          WHERE name = 'max_connections';
        `,
      ]);

      const stats = connectionCounts.reduce(
        (acc, row) => {
          const count = Number(row.count);
          if (row.state === 'active') {
            acc.active = count;
          } else if (row.state === 'idle') {
            acc.idle = count;
          }
          acc.total += count;
          return acc;
        },
        { active: 0, idle: 0, total: 0 }
      );

      return {
        ...stats,
        maxConnections: maxConnections[0]?.max_connections || 0,
      };
    } catch (error) {
      logger.error('Failed to get connection stats:', error);
      return { active: 0, idle: 0, total: 0, maxConnections: 0 };
    }
  }

  /**
   * Get disk usage information
   */
  private async getDiskUsage(): Promise<DatabaseHealthMetrics['diskUsage']> {
    try {
      const diskInfo = await prisma.$queryRaw<Array<{
        total_size: string;
        used_size: string;
        available_size: string;
        usage_percentage: number;
      }>>`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as total_size,
          pg_size_pretty(pg_database_size(current_database())) as used_size,
          '0' as available_size,
          0 as usage_percentage;
      `;

      const info = diskInfo[0];
      return {
        total: info?.total_size || '0 bytes',
        used: info?.used_size || '0 bytes',
        available: info?.available_size || '0 bytes',
        percentage: info?.usage_percentage || 0,
      };
    } catch (error) {
      logger.error('Failed to get disk usage:', error);
      return { total: '0 bytes', used: '0 bytes', available: '0 bytes', percentage: 0 };
    }
  }

  /**
   * Get cache hit ratio
   */
  private async getCacheHitRatio(): Promise<number> {
    try {
      const cacheStats = await prisma.$queryRaw<Array<{
        hit_ratio: number;
      }>>`
        SELECT 
          round(
            (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read) + 1)) * 100, 
            2
          ) as hit_ratio
        FROM pg_statio_user_tables;
      `;

      return cacheStats[0]?.hit_ratio || 0;
    } catch (error) {
      logger.error('Failed to get cache hit ratio:', error);
      return 0;
    }
  }

  /**
   * Get deadlock count
   */
  private async getDeadlockCount(): Promise<number> {
    try {
      const deadlocks = await prisma.$queryRaw<Array<{
        deadlocks: bigint;
      }>>`
        SELECT deadlocks 
        FROM pg_stat_database 
        WHERE datname = current_database();
      `;

      return Number(deadlocks[0]?.deadlocks || 0);
    } catch (error) {
      logger.error('Failed to get deadlock count:', error);
      return 0;
    }
  }

  /**
   * Get count of long-running queries
   */
  private async getLongRunningQueryCount(): Promise<number> {
    try {
      const longQueries = await prisma.$queryRaw<Array<{
        count: bigint;
      }>>`
        SELECT count(*) as count
        FROM pg_stat_activity 
        WHERE state = 'active' 
          AND query_start < now() - interval '5 minutes'
          AND datname = current_database();
      `;

      return Number(longQueries[0]?.count || 0);
    } catch (error) {
      logger.error('Failed to get long-running query count:', error);
      return 0;
    }
  }

  /**
   * Get count of blocked queries
   */
  private async getBlockedQueryCount(): Promise<number> {
    try {
      const blockedQueries = await prisma.$queryRaw<Array<{
        count: bigint;
      }>>`
        SELECT count(*) as count
        FROM pg_stat_activity 
        WHERE wait_event_type = 'Lock'
          AND datname = current_database();
      `;

      return Number(blockedQueries[0]?.count || 0);
    } catch (error) {
      logger.error('Failed to get blocked query count:', error);
      return 0;
    }
  }

  /**
   * Get index bloat information
   */
  private async getIndexBloat(): Promise<DatabaseHealthMetrics['indexBloat']> {
    try {
      // This is a simplified bloat detection query
      // In production, you might want to use more sophisticated methods
      const bloatStats = await prisma.$queryRaw<Array<{
        table_name: string;
        index_name: string;
        bloat_ratio: number;
        wasted_bytes: string;
      }>>`
        SELECT 
          tablename as table_name,
          indexname as index_name,
          0 as bloat_ratio,
          '0 bytes' as wasted_bytes
        FROM pg_indexes 
        WHERE schemaname = 'public'
        LIMIT 0; -- Placeholder query for now
      `;

      return bloatStats.map(stat => ({
        tableName: stat.table_name,
        indexName: stat.index_name,
        bloatRatio: stat.bloat_ratio,
        wastedBytes: stat.wasted_bytes,
      }));
    } catch (error) {
      logger.error('Failed to get index bloat info:', error);
      return [];
    }
  }

  /**
   * Optimize database by running maintenance commands
   */
  async optimizeDatabase(): Promise<{
    vaccumedTables: string[];
    analyzedTables: string[];
    reindexedTables: string[];
  }> {
    try {
      logger.info('Starting database optimization...');

      // Get list of tables that need maintenance
      const tablesNeedingMaintenance = await this.getTablesNeedingMaintenance();
      
      const vaccumedTables: string[] = [];
      const analyzedTables: string[] = [];
      const reindexedTables: string[] = [];

      for (const table of tablesNeedingMaintenance) {
        try {
          // VACUUM ANALYZE for tables with high update/delete activity
          if (table.needsVacuum) {
            await prisma.$executeRawUnsafe(`VACUUM ANALYZE "${table.tableName}"`);
            vaccumedTables.push(table.tableName);
            analyzedTables.push(table.tableName);
            logger.info(`Vacuumed and analyzed table: ${table.tableName}`);
          } else if (table.needsAnalyze) {
            // Just ANALYZE for tables with outdated statistics
            await prisma.$executeRawUnsafe(`ANALYZE "${table.tableName}"`);
            analyzedTables.push(table.tableName);
            logger.info(`Analyzed table: ${table.tableName}`);
          }

          // REINDEX for tables with significant bloat
          if (table.needsReindex) {
            await prisma.$executeRawUnsafe(`REINDEX TABLE "${table.tableName}"`);
            reindexedTables.push(table.tableName);
            logger.info(`Reindexed table: ${table.tableName}`);
          }
        } catch (tableError) {
          logger.error(`Failed to maintain table ${table.tableName}:`, tableError);
        }
      }

      logger.info('Database optimization completed', {
        vaccumedTables: vaccumedTables.length,
        analyzedTables: analyzedTables.length,
        reindexedTables: reindexedTables.length,
      });

      return { vaccumedTables, analyzedTables, reindexedTables };
    } catch (error) {
      logger.error('Database optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get tables that need maintenance
   */
  private async getTablesNeedingMaintenance(): Promise<Array<{
    tableName: string;
    needsVacuum: boolean;
    needsAnalyze: boolean;
    needsReindex: boolean;
  }>> {
    try {
      const maintenanceInfo = await prisma.$queryRaw<Array<{
        table_name: string;
        n_tup_ins: bigint;
        n_tup_upd: bigint;
        n_tup_del: bigint;
        last_vacuum: Date | null;
        last_analyze: Date | null;
        reltuples: bigint;
      }>>`
        SELECT 
          t.relname as table_name,
          s.n_tup_ins,
          s.n_tup_upd,
          s.n_tup_del,
          s.last_vacuum,
          s.last_analyze,
          t.reltuples
        FROM pg_class t
        LEFT JOIN pg_stat_user_tables s ON s.relid = t.oid
        WHERE t.relkind = 'r'
          AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
      `;

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      return maintenanceInfo.map(info => {
        const totalChanges = Number(info.n_tup_ins + info.n_tup_upd + info.n_tup_del);
        const tableSize = Number(info.reltuples);
        const changeRatio = tableSize > 0 ? totalChanges / tableSize : 0;

        return {
          tableName: info.table_name,
          needsVacuum: !info.last_vacuum || info.last_vacuum < oneWeekAgo || changeRatio > 0.1,
          needsAnalyze: !info.last_analyze || info.last_analyze < oneWeekAgo || changeRatio > 0.05,
          needsReindex: changeRatio > 0.2, // High change ratio indicates potential bloat
        };
      });
    } catch (error) {
      logger.error('Failed to get tables needing maintenance:', error);
      return [];
    }
  }

  /**
   * Check if database needs optimization
   */
  async needsOptimization(): Promise<{
    needed: boolean;
    reasons: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    try {
      const reasons: string[] = [];
      let maxSeverity: 'low' | 'medium' | 'high' = 'low';

      // Check cache hit ratio
      const cacheHitRatio = await this.getCacheHitRatio();
      if (cacheHitRatio < 95) {
        reasons.push(`Low cache hit ratio: ${cacheHitRatio}%`);
        maxSeverity = cacheHitRatio < 85 ? 'high' : 'medium';
      }

      // Check for long-running queries
      const longRunningQueries = await this.getLongRunningQueryCount();
      if (longRunningQueries > 5) {
        reasons.push(`${longRunningQueries} long-running queries detected`);
        maxSeverity = longRunningQueries > 10 ? 'high' : 'medium';
      }

      // Check for blocked queries
      const blockedQueries = await this.getBlockedQueryCount();
      if (blockedQueries > 0) {
        reasons.push(`${blockedQueries} blocked queries detected`);
        maxSeverity = 'medium';
      }

      // Check tables needing maintenance
      const tablesNeedingMaintenance = await this.getTablesNeedingMaintenance();
      const urgentTables = tablesNeedingMaintenance.filter(t => t.needsVacuum || t.needsReindex);
      if (urgentTables.length > 0) {
        reasons.push(`${urgentTables.length} tables need maintenance`);
        maxSeverity = urgentTables.length > 5 ? 'high' : 'medium';
      }

      return {
        needed: reasons.length > 0,
        reasons,
        severity: maxSeverity,
      };
    } catch (error) {
      logger.error('Failed to check optimization needs:', error);
      return { needed: false, reasons: [], severity: 'low' };
    }
  }
}

export const databaseOptimizationService = new DatabaseOptimizationService();