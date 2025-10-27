# LabControl 🧺

**LabControl** é uma extensão avançada para o Visual Studio Code projetada para simplificar o gerenciamento completo de insumos, ensaios e equipamentos de laboratório, com foco especial em testes de performance de lavagem.

---

## ✨ Controle de Insumos

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

### 📅 **Cronograma Interativo (Gantt)**
- **Visualização Temporal:** Cronograma visual de ensaios, calibrações e férias
- **Drag & Drop:** Reorganize ensaios facilmente arrastando no cronograma
- **Múltiplos Tipos:** Suporte para ensaios de eficiência, segurança, calibrações e períodos de férias
- **Controle de Permissões:** Sistema de usuários com diferentes níveis de acesso

### 🔍 **Previsão de Consumo**
- **Modelagem de Consumo:** Visualize o consumo futuro com base nos ensaios previstos
- **Alertas de Estoque:** Notificações quando o estoque de insumos está abaixo do mínimo configurado

## 🧺 Controle de Carga

### 📊 **Dashboard de Monitoramento**
Visualize em tempo real a distribuição e status das peças de carga através de gráficos interativos organizados por tipo:
- **Fronhas:** Controle completo de fronhas ativas com filtros por TAG
- **Toalhas de Rosto:** Monitoramento de toalhas com status detalhado
- **Lençóis:** Gestão de lençóis com rastreamento de ciclos

### 🏷️ **Gestão de Peças de Carga**
Sistema completo para controle de peças têxteis utilizadas nos ensaios:
- **Cadastro de Peças:** Registro de novas peças com TAG única, tipo e data de aquisição
- **Controle de Status:** Acompanhamento do status das peças (Ativa, Danificada, Inativa)
- **Rastreamento de Ciclos:** Monitoramento do número de ciclos de lavagem por peça
- **Filtros Avançados:** Busca rápida por TAG em todas as categorias de peças

### 📋 **Protocolos de Carga**
Criação e gerenciamento de protocolos padronizados para ensaios:
- **Cadastro de Protocolos:** Criação de novos protocolos com vinculação de peças específicas
- **Tipos de Ciclo:** Suporte para ciclos frios e quentes
- **Consulta Detalhada:** Visualização completa de protocolos com peças vinculadas
- **Exclusão Controlada:** Remoção segura de protocolos com confirmação

### ⚙️ **Processos de Carga**
Gerenciamento avançado dos processos de preparação:
- **Visualização de Processos:** Tabela completa com protocolos e tipos de ciclo
- **Filtros por Protocolo:** Busca rápida por código de protocolo específico
- **Exclusão em Massa:** Ferramenta para remoção de protocolos por ano de criação
- **Controle de Permissões:** Acesso restrito para técnicos e administradores

### 🔧 **Funcionalidades Operacionais**
- **Peças Danificadas:** Registro e controle de peças com problemas
- **Peças Inativas:** Gestão de peças fora de uso
- **Relatórios Visuais:** Gráficos de distribuição por tipo de peça
- **Interface Responsiva:** Design adaptável para diferentes tamanhos de tela

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
   - Digite "Abrir Controle de Insumos" ou "Abrir Controle de Carga"
   - A interface será aberta em uma nova aba

## 📊 Versão Atual

**Versão:** 1.4.0

## 📄 Licença

Este projeto é distribuído sob a Licença MIT. Veja o arquivo `LICENSE.md` para mais detalhes.

---