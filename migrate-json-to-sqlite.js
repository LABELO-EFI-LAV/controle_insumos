const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class DatabaseMigrator {
    constructor(jsonPath = null, sqlitePath = null) {
        // Permitir especificar caminhos customizados ou usar argumentos da linha de comando
        this.jsonPath = jsonPath || process.argv[2] || path.join(__dirname, 'database.json');
        this.sqlitePath = sqlitePath || process.argv[3] || path.join(__dirname, 'database.sqlite');
        this.db = null;
        this.data = null;
        
        // Converter caminhos relativos para absolutos
        if (!path.isAbsolute(this.jsonPath)) {
            this.jsonPath = path.resolve(this.jsonPath);
        }
        if (!path.isAbsolute(this.sqlitePath)) {
            this.sqlitePath = path.resolve(this.sqlitePath);
        }
    }

    async migrate() {
        try {
            console.log('🚀 Iniciando migração do database.json para database.sqlite...\n');
            console.log(`📂 Arquivo JSON: ${this.jsonPath}`);
            console.log(`📁 Arquivo SQLite: ${this.sqlitePath}\n`);

            // 1. Verificar se o arquivo JSON existe
            if (!fs.existsSync(this.jsonPath)) {
                throw new Error(`Arquivo ${this.jsonPath} não encontrado!`);
            }

            // 2. Criar diretório de destino se não existir
            const sqliteDir = path.dirname(this.sqlitePath);
            if (!fs.existsSync(sqliteDir)) {
                fs.mkdirSync(sqliteDir, { recursive: true });
                console.log(`📁 Diretório criado: ${sqliteDir}`);
            }

            // 2. Ler e parsear o JSON
            console.log('📖 Lendo arquivo database.json...');
            this.data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            console.log(`✅ JSON carregado com sucesso!`);
            console.log(`   - Inventory items: ${this.data.inventory?.length || 0}`);
            console.log(`   - Historical assays: ${this.data.historicalAssays?.length || 0}`);
            console.log(`   - Scheduled assays: ${this.data.scheduledAssays?.length || 0}`);
            console.log(`   - Safety scheduled assays: ${this.data.safetyScheduledAssays?.length || 0}`);
            console.log(`   - Holidays: ${this.data.holidays?.length || 0}`);
            console.log(`   - Calibrations: ${this.data.calibrations?.length || 0}`);
            console.log(`   - Efficiency categories: ${this.data.efficiencyCategories?.length || 0}`);
            console.log(`   - Safety categories: ${this.data.safetyCategories?.length || 0}`);
            console.log(`   - Calibration equipments: ${this.data.calibrationEquipments?.length || 0}`);
            console.log(`   - Settings: ${this.data.settings ? Object.keys(this.data.settings).length : 0}`);
            console.log(`   - System users: ${this.data.systemUsers ? Object.keys(this.data.systemUsers).length : 0}\n`);

            // 3. Conectar ao SQLite
            await this.connectToSQLite();

            // 4. Criar tabelas
            await this.createTables();

            // 5. Migrar todos os dados
            await this.migrateData();

            // 7. Fechar conexão
            await this.closeConnection();

            console.log('\n🎉 Migração concluída com SUCESSO!');
            console.log(`📁 Banco SQLite criado em: ${this.sqlitePath}`);

        } catch (error) {
            console.error('\n❌ Erro durante a migração:', error.message);
            if (this.db) {
                await this.closeConnection();
            }
            process.exit(1);
        }
    }

    async connectToSQLite() {
        return new Promise((resolve, reject) => {
            console.log('🔌 Conectando ao banco SQLite...');
            this.db = new sqlite3.Database(this.sqlitePath, (err) => {
                if (err) {
                    reject(new Error(`Erro ao conectar ao SQLite: ${err.message}`));
                } else {
                    console.log('✅ Conectado ao SQLite com sucesso!\n');
                    resolve();
                }
            });
        });
    }

    async createTables() {
        console.log('🏗️  Criando tabelas...');

        // Tabela de inventory
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY,
                reagent TEXT NOT NULL,
                manufacturer TEXT NOT NULL,
                lot TEXT NOT NULL,
                quantity REAL NOT NULL,
                validity TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de historical assays
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS historical_assays (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                orcamento TEXT,
                assay_manufacturer TEXT NOT NULL,
                model TEXT NOT NULL,
                nominal_load REAL NOT NULL,
                tensao TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                setup INTEGER NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                observacoes TEXT,
                cycles INTEGER NOT NULL,
                report TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de ensaios agendados
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS scheduled_assays (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                orcamento TEXT,
                assay_manufacturer TEXT NOT NULL,
                model TEXT NOT NULL,
                nominal_load REAL NOT NULL,
                tensao TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                setup INTEGER NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                observacoes TEXT,
                cycles INTEGER,
                planned_suppliers TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de ensaios de segurança agendados
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS safety_scheduled_assays (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                orcamento TEXT NOT NULL,
                assay_manufacturer TEXT NOT NULL,
                model TEXT NOT NULL,
                nominal_load REAL NOT NULL,
                tensao TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                setup TEXT NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                observacoes TEXT,
                cycles INTEGER,
                sub_row_index INTEGER
            )
        `);

        // Tabela de feriados
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS holidays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de calibrações
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS calibrations (
                id INTEGER PRIMARY KEY,
                protocol TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                affected_terminals TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de categorias de eficiência
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS efficiency_categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de categorias de segurança
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS safety_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de equipamentos de calibração
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS calibration_equipments (
                id TEXT PRIMARY KEY,
                tag TEXT NOT NULL,
                equipment TEXT NOT NULL,
                validity TEXT NOT NULL,
                observations TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de configurações
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de usuários do sistema
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS system_users (
                username TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                display_name TEXT NOT NULL,
                permissions TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de lots (relacionada aos assays)
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS assay_lots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assay_id INTEGER NOT NULL,
                reagent_type TEXT NOT NULL,
                lot TEXT NOT NULL,
                cycles INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (assay_id) REFERENCES historical_assays (id)
            )
        `);

        console.log('✅ Tabelas criadas com sucesso!\n');
    }

    async migrateData() {
        console.log('📦 Migrando dados...');
        
        // Limpar tabelas principais antes da migração para evitar conflitos de UNIQUE constraint
        console.log('🧹 Limpando tabelas existentes...');
        try {
            await this.runQuery('DELETE FROM assay_lots');
            await this.runQuery('DELETE FROM inventory');
            await this.runQuery('DELETE FROM historical_assays');
            await this.runQuery('DELETE FROM scheduled_assays');
            await this.runQuery('DELETE FROM safety_scheduled_assays');
            await this.runQuery('DELETE FROM holidays');
            await this.runQuery('DELETE FROM calibrations');
            await this.runQuery('DELETE FROM efficiency_categories');
            await this.runQuery('DELETE FROM safety_categories');
            console.log('✅ Tabelas limpas com sucesso!\n');
        } catch (error) {
            console.log('⚠️  Algumas tabelas podem não existir ainda, continuando...\n');
        }
        
        // Migrar inventário
        if (this.data.inventory) {
            console.log('  📋 Migrando inventory...');
            const inventoryStmt = `
                INSERT INTO inventory (id, reagent, manufacturer, lot, quantity, validity)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const item of this.data.inventory) {
                try {
                    await this.runQuery(inventoryStmt, [
                        item.id,
                        item.reagent || 'N/A',
                        item.manufacturer || 'N/A',
                        item.lot || 'N/A',
                        item.quantity || 0,
                        item.validity || new Date().toISOString()
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir item ${item.id}:`, error.message);
                    errorCount++;
                }
            }
            
            console.log(`  ✅ ${successCount} itens de inventory migrados`);
            if (errorCount > 0) {
                console.log(`  ⚠️  ${errorCount} itens falharam`);
            }
        }

        // Migrar ensaios históricos
        if (this.data.historicalAssays) {
            console.log('  📊 Migrando historicalAssays...');
            const assaysStmt = `
                INSERT INTO historical_assays (id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, report)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const assay of this.data.historicalAssays) {
                try {
                    await this.runQuery(assaysStmt, [
                        assay.id,
                        assay.protocol || 'N/A',
                        assay.orcamento,
                        assay.assayManufacturer || 'N/A',
                        assay.model || 'N/A',
                        assay.nominalLoad || 0,
                        assay.tensao || 'N/A',
                        assay.startDate || new Date().toISOString(),
                        assay.endDate || new Date().toISOString(),
                        assay.setup || 0,
                        assay.status || 'completed',
                        assay.type || 'standard',
                        assay.observacoes,
                        assay.cycles || 0,
                        assay.report
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir assay ${assay.id}:`, error.message);
                    errorCount++;
                }
            }
            
            console.log(`  ✅ ${successCount} ensaios históricos migrados`);
            if (errorCount > 0) {
                console.log(`  ⚠️  ${errorCount} ensaios falharam`);
            }

            // Migrar lotes de ensaios históricos
            console.log('  🧪 Migrando lotes de ensaios históricos...');
            const lotsStmt = `
                INSERT INTO assay_lots (assay_id, reagent_type, lot, cycles)
                VALUES (?, ?, ?, ?)
            `;
            
            let totalLots = 0;
            for (const assay of this.data.historicalAssays) {
                if (assay.lots) {
                    for (const [reagentType, lots] of Object.entries(assay.lots)) {
                        for (const lot of lots) {
                            try {
                                await this.runQuery(lotsStmt, [
                                    assay.id,
                                    reagentType,
                                    lot.lot,
                                    lot.cycles
                                ]);
                                totalLots++;
                            } catch (error) {
                                console.error(`   ❌ Erro ao inserir lote ${lot.lot}:`, error.message);
                            }
                        }
                    }
                }
            }
            console.log(`  ✅ ${totalLots} lotes de ensaios históricos migrados`);
        }

        // Migrar ensaios agendados
        if (this.data.scheduledAssays) {
            console.log('  📅 Migrando scheduledAssays...');
            const scheduledStmt = `
                INSERT INTO scheduled_assays (id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, planned_suppliers)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            let successCount = 0;
            let errorCount = 0;
            for (const assay of this.data.scheduledAssays) {
                try {
                    await this.runQuery(scheduledStmt, [
                        assay.id,
                        assay.protocol || 'N/A',
                        assay.orcamento,
                        assay.assayManufacturer || 'N/A',
                        assay.model || 'N/A',
                        assay.nominalLoad || 0,
                        assay.tensao || 'N/A',
                        assay.startDate || new Date().toISOString(),
                        assay.endDate || new Date().toISOString(),
                        assay.setup || 0,
                        assay.status || 'pending',
                        assay.type || 'standard',
                        assay.observacoes,
                        assay.cycles || 0,
                        JSON.stringify(assay.plannedSuppliers || {})
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir ensaio agendado ${assay.id}:`, error.message);
                    errorCount++;
                }
            }
            
            if (errorCount > 0) {
                console.log(`  ⚠️  ${errorCount} ensaios falharam`);
            }
            console.log(`  ✅ ${successCount} ensaios agendados migrados`);
        }

        // Migrar ensaios de segurança agendados
        if (this.data.safetyScheduledAssays) {
            console.log('  🛡️ Migrando safetyScheduledAssays...');
            const safetyStmt = `
                INSERT INTO safety_scheduled_assays (id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, sub_row_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            let successCount = 0;
            for (const assay of this.data.safetyScheduledAssays) {
                try {
                    await this.runQuery(safetyStmt, [
                        assay.id,
                        assay.protocol,
                        assay.orcamento,
                        assay.assayManufacturer,
                        assay.model,
                        assay.nominalLoad,
                        assay.tensao,
                        assay.startDate,
                        assay.endDate,
                        assay.setup,
                        assay.status,
                        assay.type,
                        assay.observacoes,
                        assay.cycles,
                        assay.subRowIndex || null
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir ensaio de segurança ${assay.id}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} ensaios de segurança agendados migrados`);
        }

        // Migrar feriados
        if (this.data.holidays) {
            console.log('  🎉 Migrando holidays...');
            const holidaysStmt = `
                INSERT INTO holidays (id, name, start_date, end_date)
                VALUES (?, ?, ?, ?)
            `;
            
            let successCount = 0;
            for (const holiday of this.data.holidays) {
                try {
                    await this.runQuery(holidaysStmt, [
                         holiday.id,
                         holiday.name,
                         holiday.startDate,
                         holiday.endDate
                     ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir feriado ${holiday.name}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} feriados migrados`);
        }

        // Migrar calibrações
        if (this.data.calibrations) {
            console.log('  🔧 Migrando calibrations...');
            const calibrationsStmt = `
                INSERT INTO calibrations (id, protocol, start_date, end_date, type, status, affected_terminals)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            let successCount = 0;
            for (const calibration of this.data.calibrations) {
                try {
                    await this.runQuery(calibrationsStmt, [
                         calibration.id,
                         calibration.protocol,
                         calibration.startDate,
                         calibration.endDate,
                         calibration.type,
                         calibration.status,
                         calibration.affectedTerminals
                     ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir calibração ${calibration.id}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} calibrações migradas`);
        }

        // Migrar categorias de eficiência
        if (this.data.efficiencyCategories) {
            console.log('  📈 Migrando efficiencyCategories...');
            const efficiencyStmt = `
                INSERT INTO efficiency_categories (id, name)
                VALUES (?, ?)
            `;
            
            let successCount = 0;
            for (const category of this.data.efficiencyCategories) {
                try {
                    await this.runQuery(efficiencyStmt, [
                        category.id,
                        category.name
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir categoria de eficiência ${category.id}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} categorias de eficiência migradas`);
        }

        // Migrar categorias de segurança
        if (this.data.safetyCategories) {
            console.log('  🛡️ Migrando safetyCategories...');
            const safetyCatStmt = `
                INSERT INTO safety_categories (id, name)
                VALUES (?, ?)
            `;
            
            let successCount = 0;
            for (const category of this.data.safetyCategories) {
                try {
                    await this.runQuery(safetyCatStmt, [
                        category.id,
                        category.name
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir categoria de segurança ${category.id}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} categorias de segurança migradas`);
        }

        // Migrar equipamentos de calibração
        if (this.data.calibrationEquipments) {
            console.log('  🔬 Migrando calibrationEquipments...');
            
            // Limpar tabela existente para evitar conflitos de UNIQUE constraint
            console.log('     🧹 Limpando tabela calibration_equipments...');
            await this.runQuery('DELETE FROM calibration_equipments');
            
            const equipmentStmt = `
                INSERT INTO calibration_equipments (id, tag, equipment, validity, observations)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            let successCount = 0;
            for (const equipment of this.data.calibrationEquipments) {
                try {
                    await this.runQuery(equipmentStmt, [
                        equipment.id,
                        equipment.tag,
                        equipment.equipment,
                        equipment.validity,
                        equipment.observations || ''
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir equipamento ${equipment.tag || equipment.id}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} equipamentos de calibração migrados`);
        }

        // Migrar configurações
        if (this.data.settings) {
            console.log('  ⚙️ Migrando settings...');
            
            // Limpar tabela existente para evitar conflitos de UNIQUE constraint
            console.log('     🧹 Limpando tabela settings...');
            await this.runQuery('DELETE FROM settings');
            
            const settingsStmt = `
                INSERT INTO settings (key, value)
                VALUES (?, ?)
            `;
            
            let successCount = 0;
            for (const [key, value] of Object.entries(this.data.settings)) {
                try {
                    await this.runQuery(settingsStmt, [
                        key,
                        typeof value === 'object' ? JSON.stringify(value) : String(value)
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir configuração ${key}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} configurações migradas`);
        }

        // Migrar usuários do sistema
        if (this.data.systemUsers) {
            console.log('  👤 Migrando systemUsers...');
            
            // Limpar tabela existente para evitar conflitos de UNIQUE constraint
            console.log('     🧹 Limpando tabela system_users...');
            await this.runQuery('DELETE FROM system_users');
            
            const usersStmt = `
                INSERT INTO system_users (username, type, display_name, permissions)
                VALUES (?, ?, ?, ?)
            `;
            
            let successCount = 0;
            for (const [username, user] of Object.entries(this.data.systemUsers)) {
                try {
                    await this.runQuery(usersStmt, [
                        username,
                        user.type,
                        user.displayName,
                        JSON.stringify(user.permissions)
                    ]);
                    successCount++;
                } catch (error) {
                    console.error(`   ❌ Erro ao inserir usuário ${username}:`, error.message);
                }
            }
            console.log(`  ✅ ${successCount} usuários do sistema migrados`);
        }

        console.log('✅ Migração de dados concluída!');
    }



    async runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async closeConnection() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('🔌 Conexão SQLite fechada com sucesso!');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

// Executar migração
if (require.main === module) {
    // Verificar se foram fornecidos argumentos de linha de comando
    if (process.argv.length > 2) {
        console.log('📋 Uso do script:');
        console.log('   node migrate-json-to-sqlite.js [caminho-json] [caminho-sqlite]');
        console.log('');
        console.log('📝 Exemplos:');
        console.log('   node migrate-json-to-sqlite.js');
        console.log('   node migrate-json-to-sqlite.js ./meu-projeto/database.json');
        console.log('   node migrate-json-to-sqlite.js ./origem/database.json ./destino/database.sqlite');
        console.log('   node migrate-json-to-sqlite.js "C:\\Meu Projeto\\database.json" "C:\\Meu Projeto\\database.sqlite"');
        console.log('');
    }
    
    const migrator = new DatabaseMigrator();
    migrator.migrate();
}

module.exports = DatabaseMigrator;