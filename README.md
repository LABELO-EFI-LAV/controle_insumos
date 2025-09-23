# LabControl 🧪🧺

**LabControl** é uma extensão avançada para o Visual Studio Code projetada para simplificar o gerenciamento completo de insumos, ensaios e equipamentos de laboratório, com foco especial em testes de performance de lavagem. Centralize o controle de reagentes, lotes, ensaios, calibrações e gere relatórios detalhados, tudo dentro do seu editor de código.

---

## ✨ Principais Funcionalidades

### 📊 **Dashboard Visual Avançado**
Tenha uma visão geral e instantânea do seu laboratório com cartões de resumo (total de ensaios, insumos em estoque) e gráficos interativos que mostram o consumo por lote, estoque atual e performance de marcas.

### 📦 **Gestão Completa de Inventário**
Cadastre e controle todos os seus insumos, como Pó Base, Perborato, TAED e Tiras de Sujidade. Acompanhe lotes, fornecedores, quantidades e datas de validade em uma tabela clara e organizada com alertas automáticos de vencimento.

### 🔬 **Registro Detalhado de Ensaios**
Registre novos ensaios de forma completa, associando protocolo, modelo da máquina, carga nominal, ciclos e os lotes específicos de cada reagente utilizado na operação. Suporte para ensaios de eficiência e segurança.

### ⚙️ **Sistema de Calibração de Equipamentos**
- **Controle de Status:** Gerencie equipamentos com status "Operacional", "Em Calibração", "Próximo do Vencimento" e "Vencido"
- **Workflow Completo:** Botões dinâmicos para iniciar calibração e finalizar com nova data de validade
- **Alertas Automáticos:** Notificações quando equipamentos estão próximos da calibração (configurável)
- **Histórico:** Rastreamento completo de calibrações realizadas

### 📅 **Cronograma Interativo (Gantt)**
- **Visualização Temporal:** Cronograma visual de ensaios, calibrações e férias
- **Drag & Drop:** Reorganize ensaios facilmente arrastando no cronograma
- **Múltiplos Tipos:** Suporte para ensaios de eficiência, segurança, calibrações e períodos de férias
- **Controle de Permissões:** Sistema de usuários com diferentes níveis de acesso

### 👥 **Sistema de Usuários e Permissões**
- **Três Níveis:** Administrador, Técnico e Visualizador
- **Controle Granular:** Permissões específicas para edição, visualização e configurações
- **Login Automático:** Integração com usuário do VS Code
- **Segurança:** Proteção por senha para funções administrativas

### 📄 **Geração de Relatórios Profissionais em PDF**
Crie relatórios completos em PDF para períodos específicos com design moderno:
- **Cabeçalho Profissional:** Título, período, ícone e estatísticas
- **Tabelas Detalhadas:** Consumo por reagente, lote e fabricante
- **Gráficos Coloridos:** Visualizações de ciclos, consumo e tendências
- **Análise Temporal:** Quantidade de ensaios por mês

### 🔔 **Sistema de Notificações Inteligente**
- **Fila Organizada:** Notificações aparecem em sequência vertical, sem sobreposição
- **Múltiplos Tipos:** Alertas de estoque, validade de reagentes e calibração de equipamentos
- **Configurável:** Defina limites personalizados para cada tipo de alerta
- **Integração com Email:** Envio automático de alertas para responsáveis

### 🛡️ **Backup Automático e Segurança**
- **Backup Automático:** Sistema de backup a cada 6 horas
- **Histórico de Versões:** Mantenha múltiplas versões dos dados
- **Recuperação:** Restaure dados de backups anteriores quando necessário
- **Integridade:** Validação automática de dados

### ⚡ **Interface Moderna e Responsiva**
- **Design Profissional:** Interface limpa e intuitiva dentro do VS Code
- **Navegação Fluida:** Transições suaves entre páginas
- **Modais Interativos:** Formulários organizados para cada ação
- **Filtros Avançados:** Busca e filtros em todas as tabelas
- **Responsivo:** Adapta-se a diferentes tamanhos de tela

---

## 🚀 Instalação

1. **Via VS Code Marketplace:**
   - Abra o VS Code
   - Vá para a aba Extensions (Ctrl+Shift+X)
   - Pesquise por "LabControl" ou "Controle de Insumos"
   - Clique em "Install"

2. **Via VSIX (Desenvolvimento):**
   - Baixe o arquivo `.vsix` da extensão
   - No VS Code, pressione `Ctrl+Shift+P`
   - Digite "Extensions: Install from VSIX"
   - Selecione o arquivo baixado

## 📖 Como Usar

1. **Ativação:**
   - Pressione `Ctrl+Shift+P` no VS Code
   - Digite "Abrir Controle de Insumos"
   - A interface será aberta em uma nova aba

2. **Primeiro Uso:**
   - Configure seus emails de notificação em "Configurações"
   - Defina os limites de alerta de estoque e calibração
   - Cadastre seus primeiros insumos e equipamentos

3. **Navegação:**
   - **Dashboard:** Visão geral do laboratório
   - **Inventário:** Gestão de reagentes e insumos
   - **Ensaios:** Registro e acompanhamento de testes
   - **Cronograma:** Planejamento temporal de atividades
   - **Calibrações:** Controle de equipamentos
   - **Configurações:** Personalização do sistema

## 📊 Versão Atual

**Versão:** 1.1.6

### 🆕 Novidades da Versão 1.1.6
- ✅ Sistema completo de calibração de equipamentos
- ✅ Notificações em fila organizada (sem sobreposição)
- ✅ Workflow de calibração com botões dinâmicos
- ✅ Modal para finalização de calibração
- ✅ Status visual com cores diferenciadas
- ✅ Alertas configuráveis para calibração
- ✅ Melhorias na interface e usabilidade

## 🛠️ Tecnologias

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Backend:** TypeScript, Node.js
- **Framework:** VS Code Extension API
- **Relatórios:** PDFKit para geração de PDFs
- **Gráficos:** Chart.js para visualizações
- **Backup:** Sistema automático com JSON

## 📄 Licença

Este projeto é distribuído sob a Licença MIT. Veja o arquivo `LICENSE.md` para mais detalhes.

---

## Estruturas Migradas

O script migra as seguintes estruturas do JSON para SQLite:

### 1. Inventory (Inventário)
- **Tabela**: `inventory`
- **Campos**: id, reagent, manufacturer, lot, quantity, validity
- **Descrição**: Controle de estoque de reagentes
- **Registros**: 8 itens

### 2. Historical Assays (Ensaios Históricos)
- **Tabela**: `historical_assays`
- **Campos**: id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles, report
- **Descrição**: Histórico de ensaios realizados
- **Registros**: 93 ensaios

### 3. Assay Lots (Lotes de Ensaios)
- **Tabela**: `assay_lots`
- **Campos**: assay_id, reagent_type, lot, cycles
- **Descrição**: Lotes de reagentes utilizados em cada ensaio (relacionamento com historical_assays)
- **Registros**: 372 lotes

### 4. Scheduled Assays (Ensaios Agendados)
- **Tabela**: `scheduled_assays`
- **Campos**: id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles
- **Descrição**: Ensaios programados para execução
- **Registros**: 154 ensaios

### 5. Safety Scheduled Assays (Ensaios de Segurança Agendados)
- **Tabela**: `safety_scheduled_assays`
- **Campos**: id, protocol, orcamento, assay_manufacturer, model, nominal_load, tensao, start_date, end_date, setup, status, type, observacoes, cycles
- **Descrição**: Ensaios de segurança programados
- **Registros**: 76 ensaios

### 6. Holidays (Feriados)
- **Tabela**: `holidays`
- **Campos**: id, name, start_date, end_date
- **Descrição**: Calendário de feriados
- **Registros**: 13 feriados

### 7. Calibrations (Calibrações)
- **Tabela**: `calibrations`
- **Campos**: id, protocol, start_date, end_date, type, status, affected_terminals
- **Descrição**: Programação de calibrações de equipamentos
- **Registros**: 2 calibrações

### 8. Efficiency Categories (Categorias de Eficiência)
- **Tabela**: `efficiency_categories`
- **Campos**: id, name
- **Descrição**: Categorias para classificação de eficiência
- **Registros**: 8 categorias

### 9. Safety Categories (Categorias de Segurança)
- **Tabela**: `safety_categories`
- **Campos**: id (TEXT), name
- **Descrição**: Categorias de segurança (A, B, C)
- **Registros**: 3 categorias

### 10. Calibration Equipments (Equipamentos de Calibração)
- **Tabela**: `calibration_equipments`
- **Campos**: id, tag, equipment, validity, observations
- **Descrição**: Controle de equipamentos de calibração
- **Registros**: 30 equipamentos

### 11. Settings (Configurações)
- **Tabela**: `settings`
- **Campos**: key, value
- **Descrição**: Configurações do sistema
- **Registros**: 6 configurações

### 12. System Users (Usuários do Sistema)
- **Tabela**: `system_users`
- **Campos**: id, username, type, display_name, permissions
- **Descrição**: Usuários e permissões do sistema
- **Registros**: 1 usuário

---

**Desenvolvido com ❤️ para laboratórios de eficiência energética**