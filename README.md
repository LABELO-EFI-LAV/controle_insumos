# LabControl 🧪🧺

**LabControl** é uma extensão para o Visual Studio Code projetada para simplificar o gerenciamento completo de insumos e ensaios de laboratório, com um foco especial em testes de performance de lavagem. Centralize o controle de reagentes, lotes, ensaios e gere relatórios detalhados, tudo dentro do seu editor de código.

---

## Principais Funcionalidades

* **📊 Dashboard Visual:** Tenha uma visão geral e instantânea do seu laboratório com cartões de resumo (total de ensaios, insumos em estoque) e gráficos interativos que mostram o consumo por lote, estoque atual e performance de marcas.

* **📦 Gestão de Inventário:** Cadastre e controle todos os seus insumos, como Pó Base, Perborato, TAED e Tiras de Sujidade. Acompanhe lotes, fornecedores, quantidades e datas de validade em uma tabela clara e organizada.

* **🔬 Registro Detalhado de Ensaios:** Registre novos ensaios de forma completa, associando protocolo, modelo da máquina, carga nominal, ciclos e os lotes específicos de cada reagente utilizado na operação.

* **📄 Geração de Relatórios em PDF:** Crie relatórios profissionais em PDF para um período específico com design moderno e informações completas:
  - **Cabeçalho:** Título, período do relatório, ícone da aplicação e total de ensaios realizados
  - **Tabela 1:** Quantidade de ensaios realizados com cada reagente, separados por lote
  - **Tabela 2:** Top 5 fabricantes com maior consumo, mostrando consumo detalhado por reagente
  - **Tabela 3:** Consumo detalhado de reagentes por fornecedor
  - **Gráfico 1:** Quantidade de ciclos por fabricante (barras coloridas)
  - **Gráfico 2:** Consumo de reagente por lote (barras coloridas)
  - **Gráfico 3:** Consumo de reagente por fabricante (barras coloridas)
  - **Gráfico 4:** Quantidade de ensaios por mês (barras coloridas)

* **⚠️ Alertas de Estoque Baixo:** Seja notificado proativamente com um banner de alerta e uma opção para enviar e-mail quando o estoque de insumos críticos estiver baixo, garantindo que você nunca seja pego de surpresa.

* **⚙️ Interface Integrada e Intuitiva:** Toda a gestão é feita dentro de uma Webview no VS Code, com uma interface moderna e responsiva, navegação simples e modais para cada ação.


## Licença

Este projeto é distribuído sob a Licença MIT. Veja o arquivo `LICENSE` para mais detalhes.
*(Nota: Se você não tiver um arquivo de licença, considere criar um. O MIT é uma escolha comum e permissiva).*