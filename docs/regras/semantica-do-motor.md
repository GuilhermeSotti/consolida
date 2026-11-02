# Semântica do motor de regras (versão `1.0.0`)

Fonte: `src/modules/rules/domain/` (motor puro, sem dependências de framework). Referência
funcional: script Power Query M original ("Parametrização de Lógica …" + `RulesApplicator`),
disponível nos documentos do projeto. Este documento registra **o que foi portado, como, e onde
o comportamento diverge** — divergências e lacunas exigem validação do negócio antes de produção.

## 1. Conceitos

* **Regra**: pertence a uma base de entrada (`targetSourceId`), tem `type`, `name`, `phase`
  opcional, `executionOrder` ("Ordenação") e `definition` (JSON validado por tipo — propriedades
  desconhecidas são rejeitadas). Nasce **inativa**; ativar/desativar exige `rules:activate`.
* **Versão**: cada alteração cria uma `rule_version` imutável (com `changeReason` e autor);
  `PATCH` exige `expectedVersion` (409 `RULE_VERSION_CONFLICT` se outra pessoa alterou antes) e
  recusa alterações sem efeito (`RULE_UNCHANGED`).
* **Fase**: regra sem fase vale para todas as execuções; regra com fase só entra em execuções
  com a mesma fase.
* **Colunas**: todos os nomes são canônicos — porta de `NormalizeColumnNames`: maiúsculas, sem
  espaços nas pontas, espaços → `_`, `_` repetidos/nas pontas removidos (`" valor  total "` →
  `VALOR_TOTAL`). Cabeçalhos repetidos recebem `_1`, `_2`…; vazios viram `COLUMN_<n>`. Toda carga
  ganha `FILE_ID` (nome do arquivo) e `VOLUME = 1` (paridade com `Sheets.LoadSheet`).
* **Valores**: texto, número, booleano ou nulo. Célula vazia → nulo; datas → ISO `AAAA-MM-DD`.

## 2. Ordem de aplicação

Mesma ordem de `RulesApplicator.ApplyAll`: **Matrix (`LOOKUP`) → Aritmética (`ARITHMETIC`) →
Causante (`CONDITIONAL_ASSIGNMENT`) → [Variável — não suportada] → Constante (`FILTER`) →
Padronal (`STANDARDIZATION`) → Colunas finais (`PROJECTION`)**. Dentro de cada estágio:
`executionOrder` crescente e, em empate, o id da regra (determinismo). Cada regra recebe o
resultado da anterior; as entradas nunca são alteradas.

## 3. Comparação de valores (Constante e Causante)

Condição: `{ "column", "operator", "values": [...], "normalization"?: [...], "compareAs"?: "AUTO" }`.
A condição é verdadeira quando **algum** valor de `values` (valores de comparação — "Valor de
Comparação"/"Operados" no script) satisfaz o operador.

* `normalization` ("Modo de Operação", aplicada aos dois lados, na ordem): `DEFAULT` (padrão),
  `TRIM` (retirar espaços), `REMOVE_SPECIAL_CHARACTERS` (mantém `[0-9A-Za-z]`), `LOWERCASE`,
  `UPPERCASE`, `TEXT_ONLY` (mantém `[A-Za-z0-9 ]`), `DIGITS_ONLY`, `LENGTH` (quantidade de
  caracteres).
* `operator`: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `GREATER_OR_EQUAL`,
  `LESS_OR_EQUAL`, `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `ENDS_WITH`.
* `compareAs`: `AUTO` (número quando os dois lados são numéricos, senão texto), `TEXT`, `NUMBER`
  (se algum lado não for numérico, só `NOT_EQUALS` é verdadeiro).
* Números aceitos: `1234.56`, `1234,56`, `1.234,56`, `1,234.56`; um único separador é sempre o
  decimal.
* Nulos: `EQUALS(nulo, nulo)` e `NOT_EQUALS(x, nulo)` são verdadeiros; demais comparações com
  nulo são falsas. Operadores de texto tratam nulo como texto vazio.
* Coluna inexistente na base: a condição é falsa (com aviso no log da execução).

## 4. Tipos de regra

### 4.1 `FILTER` — Lógica Constante
```json
{ "condition": { "column": "STATUS", "operator": "EQUALS", "values": ["OK"], "normalization": ["TRIM", "UPPERCASE"] } }
```
Mantém somente as linhas que satisfazem a condição (sem linhas, as colunas são preservadas).
Coluna inexistente → regra não aplicada, com aviso no log (no M a regra era ignorada sem registro).

### 4.2 `CONDITIONAL_ASSIGNMENT` — Lógica Causante
```json
{ "condition": { "column": "VALOR", "operator": "GREATER_THAN", "values": [1000] },
  "targetColumn": "FAIXA", "value": { "kind": "LITERAL", "value": "ALTA" } }
```
Onde a condição vale, grava o valor literal ou o de outra coluna (`{"kind":"COLUMN","column":"X"}`)
em `targetColumn` (criada se não existir, com nulo nas demais linhas). Linhas que não atendem
mantêm o valor anterior.

### 4.3 `ARITHMETIC` — Lógica Aritmética
```json
{ "operands": ["VALOR", "IMPOSTO"], "operations": ["SUBTRACT"], "targetColumn": "LIQUIDO" }
```
Dobra os operandos da esquerda para a direita (`ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`,
`AVERAGE_BY_ROW_COUNT` = valor acumulado ÷ número de linhas). Exatamente uma operação entre cada
par. Operando vazio/não numérico ou coluna inexistente vale **0** (comportamento original).
Divisão por zero → **nulo** + aviso (o M produzia ±infinito, impossível de persistir). A coluna
de destino é (re)criada no fim.

### 4.4 `STANDARDIZATION` — Lógica Padronal
```json
{ "columns": ["FORNECEDOR"], "operation": { "kind": "CLEAN", "removeSpecialCharacters": true } }
```
`columns` é uma lista ou `"ALL"` ("todas as colunas"). Operações: `TRUNCATE {length}`, `REMOVE
{substrings}`, `CLEAN {removeSpecialCharacters}` (minúsculas + remoção de acentos, opcionalmente
só `[a-z0-9 ]`), `KEEP {tokens}` (concatena os tokens encontrados, sem diferenciar maiúsculas;
nenhum → nulo), `TRIM`, `REPLACE_SPACES {replacement}`, `NORMALIZE` (chave normalizada, ver 4.5)
e `INDEX {start}` (sequência começando em `start`, coluna movida para o fim; exige lista
explícita). Nulos permanecem nulos.

### 4.5 `LOOKUP` — Lógica Matrix
```json
{ "keyColumns": ["CNPJ"], "referenceSourceIds": ["<uuid da base de fornecedores>"],
  "referenceKeyColumns": ["CNPJ_FORNECEDOR"], "columnsToBring": ["RAZAO_SOCIAL"], "matchMode": "EXACT" }
```
Enriquecimento a partir da **união** das bases de referência ("Aba Referência"; a carga usada de
cada uma é fixada no snapshot da execução). Chaves pareadas por posição e comparadas após
normalização (`normalizarValor`: vazio → marcador `__MATRIX_BLANK__`; número → forma canônica;
texto → minúsculas sem espaços, espaços não separáveis e pontos).

* `EXACT` (junção original): referência deduplicada pela chave bruta; *left join* que **duplica**
  a linha quando várias linhas de referência têm a mesma chave normalizada; só acrescenta colunas
  que a base ainda não tem.
* `NORMALIZED` ("Pesquisa Avançada"): no máximo uma correspondência por chave; para cada coluna
  pedida mantém o valor da base se não estiver vazio, senão usa o da referência (`NO DATA` quando
  a chave correspondente da referência é vazia); colunas movidas para o fim.
* Base sem linhas: a projeção da referência (chaves renomeadas) vira a base (como no original).
* Referência ausente ou sem a coluna-chave: regra sem efeito + aviso; colunas pedidas são criadas
  com nulo. A duplicação de linhas é limitada por `EXECUTION_MAX_ROWS` (execução falha com
  `ROW_LIMIT_EXCEEDED`).

### 4.6 `PROJECTION` — Colunas Finais / Renomeadas
```json
{ "columns": [{ "source": "NOTA_FISCAL", "as": "NF" }, { "source": "LIQUIDO", "as": "VALOR_LIQUIDO" }] }
```
Seleciona, ordena e renomeia; colunas inexistentes são ignoradas com aviso.

## 5. Divergências intencionais em relação ao script M

| # | Comportamento no M | No ConsolidaHub | Motivo |
| --- | --- | --- | --- |
| 1 | Comparação sem conversão de tipo (falha em tipos mistos) | `compareAs` explícito; `AUTO` compara numericamente quando possível | Resultado previsível; **confirmar com o negócio** |
| 2 | Divisão por zero gera ±infinito | Nulo + aviso | Valor não persistível/exportável |
| 3 | Regra com coluna inexistente ignorada sem registro (ex.: `ApplyConstantes`) | Regra sem efeito **com aviso** no log da execução | Rastreabilidade |
| 4 | `ApplyPadronal` modo "index" referencia `Rules[Indexação]` (inexistente; exporta-se `Indexacao`) e o `try … otherwise` torna a etapa um no-op silencioso | `INDEX` implementa o comportamento pretendido | Defeito latente do original |
| 5 | `ApplyAritimetico` chama `Rules[Operacao]` com 4 argumentos para uma função de 5 parâmetros obrigatórios | Dobra dos "Campos de Cálculo" com as "Operações" configuradas, gravada no "Campo Total" | Defeito latente do original; **confirmar com exemplos reais** |
| 6 | Regras e contexto lidos de listas SharePoint/Dataverse a cada execução | Regras versionadas no banco; snapshot por execução | Rastreabilidade e reprodutibilidade |
| 7 | Contexto por Parâmetro/Fornecedor/Empresa/Aba/Documento | Apenas **Fase**; demais contextos ainda não modelados | Escopo do MVP; **definir com o negócio** |

## 6. Não suportado: Lógica Variável

O script contém a "Parametrização de Lógica Variável" (`ApplyVariaveis`), executada entre
Causante e Constante. Pelo código original, ela usa campos como *Coluna/Valor de Resultado*,
*Campos de Cálculo*, *Operação*, *Campo Total*, *Agrupador*, *Comparação de Valor ID*,
*Coluna de Verificação*, *Valor de Comparação*, *Aceite* (tolerância), *Modo de Arredondamento*
(para cima/para baixo/padrão, 2 casas), *USD* e *Porcentagem LOCATION*, e as rotinas
`Aproximar` (aceita o valor quando está entre `referência − |referência| × aceite` e a
referência) e `ExecutarCambioLocation` (interseção com base de referência e câmbio).

Ela **não foi portada**: o comportamento esperado (alocação, câmbio, agrupamento, efeito sobre
linhas e colunas) não está especificado nos requisitos e não pode ser inferido com segurança do
script. Antes de implementar, o negócio precisa fornecer: objetivo da regra, exemplos de entrada
e saída esperada (incluindo casos de tolerância e arredondamento), origem e periodicidade da taxa
de câmbio e o tratamento de empates/duplicidades. Um novo tipo de regra exigirá incrementar
`ENGINE_VERSION`.

## 7. Garantias e limites

* Determinismo: mesma entrada + mesmas versões de regra + mesma versão do motor ⇒ mesmo resultado
  (sem relógio, aleatoriedade ou dependência de ordem de hash).
* Cada etapa registra linhas antes/depois, linhas afetadas, avisos e duração no log da execução.
* `ENGINE_VERSION` é gravada em cada execução; qualquer mudança de semântica deve incrementá-la e
  ser registrada aqui.
