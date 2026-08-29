// Detalhe do produto: grade, saldos, custo medio e historico de movimento.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { brl, esc, dataBR, num } from '../../core/fmt.js';
import { precoDaVariante } from '../../core/state.js';
import { icone } from '../icones.js';
import { kpi, liga, toast, modalFormulario, confirmar, tag, abrirModal , vista } from '../ui.js';
import { abrirEntradaCompra } from './entrada.js';
import { irPara } from '../router.js';

export async function render(raiz, params) {
  const desenhar = vista(raiz, () => html(params.id), (caixa, redesenhar) => ligar(caixa, params.id, redesenhar));
  return log.assinar(desenhar);
}

function html(produtoId) {
  const e = log.estado();
  const p = e.produtos[produtoId];
  if (!p) return '<div class="aviso aviso-erro">Produto não encontrado.</div>';

  const variantes = p.variantes.map((id) => e.variantes[id]).filter(Boolean);
  const saldo = variantes.reduce((s, v) => s + v.saldo, 0);
  const custo = variantes.reduce((s, v) => s + v.saldo * v.custoMedio, 0);
  const vendido = variantes.reduce((s, v) => s + v.vendidoTotal, 0);
  const custoMedioGeral = saldo > 0 ? Math.round(custo / saldo) : (variantes[0] ? variantes[0].custoMedio : 0);
  const margem = p.precoVenda > 0 && custoMedioGeral > 0
    ? ((p.precoVenda - custoMedioGeral) / p.precoVenda) * 100 : null;

  const movimentos = e.movimentos
    .filter((m) => { const v = e.variantes[m.varianteId]; return v && v.produtoId === produtoId; })
    .slice().reverse().slice(0, 40);

  return `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer">
        <h2>${esc(p.nome)} ${!p.ativo ? tag('arquivado') : ''}</h2>
        <div class="texto-2 pequeno">${esc(p.categoria || 'Sem categoria')}${p.marca ? ' · ' + esc(p.marca) : ''}</div>
      </div>
      <button class="btn btn-icone" data-acao="editar" aria-label="Editar">${icone('editar')}</button>
    </div>
    ${p.descricao ? `<p class="texto-2 pequeno">${esc(p.descricao)}</p>` : ''}
    <div class="grade grade-4">
      ${kpi('Preço de venda', brl(p.precoVenda))}
      ${kpi('Custo médio', brl(custoMedioGeral), margem === null ? 'sem custo lançado' : 'margem ' + margem.toFixed(1).replace('.', ',') + '%')}
      ${kpi('Em estoque', num(saldo), 'mínimo ' + p.estoqueMinimo)}
      ${kpi('Já vendidas', num(vendido))}
    </div>
  </div>

  <div class="barra-botoes mb">
    <button class="btn btn-primario" data-acao="entrada">${icone('baixar', 16)} Dar entrada</button>
    <button class="btn" data-acao="add-grade">${icone('mais', 16)} Adicionar tamanho/cor</button>
    <button class="btn" data-acao="editar-cores">${icone('editar', 16)} Editar cores</button>
    <button class="btn" data-acao="etiquetas">${icone('etiqueta', 16)} Etiquetas</button>
    <button class="btn ${p.ativo ? '' : 'btn-primario'}" data-acao="arquivar">${p.ativo ? 'Arquivar' : 'Reativar'}</button>
  </div>

  <div class="cartao">
    <h3>Grade</h3>
    <div class="rolagem-x"><table>
      <thead><tr><th>Tamanho</th><th>Cor</th><th>SKU</th><th class="dir">Saldo</th>
      <th class="dir">Custo médio</th><th class="dir">Preço</th><th style="width:80px"></th></tr></thead>
      <tbody>${variantes.map((v) => {
        const cls = v.saldo < 0 ? 'tag-erro' : v.saldo === 0 ? '' : v.saldo <= p.estoqueMinimo ? 'tag-alerta' : 'tag-ok';
        return `<tr${v.ativo ? '' : ' style="opacity:.5"'}>
          <td>${esc(v.tamanho)}</td>
          <td>${esc(v.cor || '—')}</td>
          <td class="mono">${esc(v.sku)}<br><span class="texto-3">${esc(v.codigoBarras)}</span></td>
          <td class="dir"><span class="tag ${cls}">${v.saldo}</span></td>
          <td class="dir num">${brl(v.custoMedio)}</td>
          <td class="dir num">${brl(precoDaVariante(e, v.id))}</td>
          <td class="dir">
            <button class="btn btn-p" data-ajustar="${v.id}">Ajustar</button>
          </td></tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>

  <div class="cartao">
    <h3>Movimento</h3>
    ${movimentos.length ? `<div class="rolagem-x"><table>
      <thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th class="dir">Qtd</th><th class="dir">Saldo</th><th>Obs.</th></tr></thead>
      <tbody>${movimentos.map((m) => {
        const v = e.variantes[m.varianteId];
        const nomes = { entrada: 'Entrada', venda: 'Venda', 'ajuste+': 'Ajuste +', 'ajuste-': 'Ajuste −', devolucao: 'Devolução', cancelamento: 'Cancelamento' };
        return `<tr><td>${dataBR(m.data)}</td><td>${nomes[m.tipo] || m.tipo}</td>
        <td class="pequeno">${esc([v.tamanho, v.cor].filter(Boolean).join('/'))}</td>
        <td class="dir ${m.qtd < 0 ? 'negativo' : 'positivo'}">${m.qtd > 0 ? '+' : ''}${m.qtd}</td>
        <td class="dir num">${m.saldoDepois}</td><td class="pequeno texto-2">${esc(m.obs || '')}</td></tr>`;
      }).join('')}</tbody></table></div>`
      : '<p class="texto-3 pequeno">Nenhum movimento ainda.</p>'}
  </div>`;
}

function ligar(raiz, produtoId, redesenhar) {
  const e = log.estado();
  const p = e.produtos[produtoId];
  if (!p) return;

  liga(raiz, 'click', '[data-acao="entrada"]', () => abrirEntradaCompra(p.variantes[0]));
  liga(raiz, 'click', '[data-acao="etiquetas"]', () => irPara('/etiquetas?produto=' + produtoId));

  liga(raiz, 'click', '[data-acao="editar"]', () => {
    modalFormulario({
      titulo: 'Editar produto',
      valores: p,
      campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
        { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', meia: true, opcoes: ['', ...(e.config.categoriasProduto || [])] },
        { nome: 'marca', rotulo: 'Marca / fornecedor', meia: true },
        { nome: 'precoVenda', rotulo: 'Preço de venda', tipo: 'moeda', meia: true, obrigatorio: true },
        { nome: 'estoqueMinimo', rotulo: 'Estoque mínimo', tipo: 'inteiro', meia: true },
        { nome: 'descricao', rotulo: 'Observações', tipo: 'textarea' },
      ],
      aoSalvar: async (d, fechar) => {
        await acoes.editarProduto(produtoId, d);
        fechar(); toast('Produto atualizado.', 'ok');
      },
    });
  });

  liga(raiz, 'click', '[data-acao="arquivar"]', async () => {
    if (p.ativo) {
      const ok = await confirmar('Arquivar produto',
        'A peça some das listas de venda, mas o histórico e os números da DRE continuam intactos. Dá para reativar depois.',
        { textoOk: 'Arquivar' });
      if (ok) { await acoes.arquivarProduto(produtoId); toast('Produto arquivado.'); }
    } else {
      await acoes.reativarProduto(produtoId);
      toast('Produto reativado.', 'ok');
    }
  });

  liga(raiz, 'click', '[data-acao="add-grade"]', () => {
    const tamanhos = e.config.tamanhos || [];
    const m = abrirModal({
      titulo: 'Adicionar à grade',
      corpo: `
        <div class="campo-grupo"><label>Tamanhos</label>
          <div class="pilulas">${tamanhos.map((t) => `<button type="button" class="pilula" data-tam="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
        <div class="campo-grupo"><label for="ng-cores">Cores</label>
          <input id="ng-cores" placeholder="Preto, Off white">
          <div class="dica">Separe por vírgula. Vazio = cor única.</div></div>`,
      botoes: [
        { texto: 'Cancelar', acao: (f) => f() },
        {
          texto: 'Adicionar', classe: 'btn-primario',
          acao: async (fechar, r) => {
            const tams = [...r.querySelectorAll('[data-tam].ativa')].map((b) => b.dataset.tam);
            const cores = (r.querySelector('#ng-cores').value || '').split(',').map((c) => c.trim()).filter(Boolean);
            const listaTam = tams.length ? tams : ['Único'];
            const listaCor = cores.length ? cores : [''];
            const novas = [];
            for (const cor of listaCor) for (const t of listaTam) {
              const existe = p.variantes.some((id) => {
                const v = e.variantes[id];
                return v && v.tamanho === t && (v.cor || '') === cor;
              });
              if (!existe) novas.push({ tamanho: t, cor });
            }
            if (!novas.length) { toast('Essas combinações já existem na grade.'); return; }
            await acoes.adicionarVariantes(produtoId, novas);
            fechar(); toast(`${novas.length} ${novas.length === 1 ? 'item adicionado' : 'itens adicionados'}.`, 'ok');
          },
        },
      ],
    });
    liga(m.el, 'click', '[data-tam]', (ev, el) => { ev.preventDefault(); el.classList.toggle('ativa'); });
  });

  // Cores do produto: corrigir nome e tirar de circulacao o que nao se compra
  // mais. Trabalha na cor inteira, nao item a item — renomear "Off White" em
  // seis tamanhos na mao termina com metade da grade com o nome velho.
  liga(raiz, 'click', '[data-acao="editar-cores"]', () => {
    const vars = p.variantes.map((id) => e.variantes[id]).filter(Boolean);
    const cores = new Map();
    for (const v of vars) {
      const k = v.cor || '';
      if (!cores.has(k)) cores.set(k, { cor: k, itens: 0, saldo: 0, ativos: 0 });
      const c = cores.get(k);
      c.itens++; c.saldo += v.saldo; if (v.ativo) c.ativos++;
    }
    const lista = [...cores.values()];

    const linha = (c, i) => `
      <div class="campo-grupo" data-cor-bloco="${i}">
        <label for="cor-${i}">${esc(c.cor || 'Cor única')} ${c.ativos ? '' : tag('arquivada', 'alerta')}</label>
        <input id="cor-${i}" value="${esc(c.cor)}" data-cor-orig="${esc(c.cor)}"
               placeholder="Cor única" autocomplete="off">
        <div class="flex entre centro" style="margin-top:.35rem">
          <span class="texto-3 pequeno">${c.itens} ${c.itens === 1 ? 'item' : 'itens'} · saldo ${c.saldo}</span>
          <button type="button" class="btn btn-p ${c.ativos ? 'btn-perigo' : ''}"
                  data-arquivar-cor="${esc(c.cor)}" data-ativos="${c.ativos}">
            ${c.ativos ? 'Arquivar cor' : 'Reativar cor'}</button>
        </div>
      </div>`;

    const m = abrirModal({
      titulo: 'Cores de ' + p.nome,
      corpo: `${lista.map(linha).join('')}
        <div class="aviso aviso-info">${icone('info')}
          <div>Corrigir o nome não muda SKU nem código de barras — a etiqueta já colada na peça continua valendo.
          Arquivar tira a cor da venda e da entrada de compra, mas preserva o histórico do que já foi vendido.</div>
        </div>`,
      botoes: [
        { texto: 'Fechar', acao: (f) => f() },
        {
          texto: 'Salvar nomes', classe: 'btn-primario',
          acao: async (fechar, r) => {
            const pares = [...r.querySelectorAll('[data-cor-orig]')]
              .map((el) => ({ de: el.dataset.corOrig, para: (el.value || '').trim() }))
              .filter((x) => x.de !== x.para);
            if (!pares.length) { toast('Nenhum nome mudou.'); return; }
            try {
              for (const par of pares) await acoes.renomearCor(produtoId, par.de, par.para);
            } catch (err) {
              toast(err.message, 'erro');
              return;
            }
            fechar();
            toast(`${pares.length} ${pares.length === 1 ? 'cor renomeada' : 'cores renomeadas'}.`, 'ok');
          },
        },
      ],
    });

    liga(m.el, 'click', '[data-arquivar-cor]', async (ev, el) => {
      ev.preventDefault();
      const cor = el.dataset.arquivarCor;
      const ativos = Number(el.dataset.ativos) > 0;
      const rotulo = cor || 'Cor única';
      if (ativos) {
        const alvo = lista.find((c) => c.cor === cor);
        const aviso = alvo && alvo.saldo > 0
          ? `Ainda há ${alvo.saldo} peça(s) em estoque nessa cor. Elas somem da tela de vender.`
          : 'Ela sai da venda e da entrada de compra.';
        const ok = await confirmar('Arquivar ' + rotulo, `${aviso} O histórico do que já foi vendido continua intacto. Dá para reativar depois.`,
          { textoOk: 'Arquivar', perigo: true });
        if (!ok) return;
      }
      await acoes.definirAtivoCor(produtoId, cor, !ativos);
      m.fechar();
      toast(ativos ? `${rotulo} arquivada.` : `${rotulo} reativada.`, 'ok');
    });
  });

  liga(raiz, 'click', '[data-ajustar]', (ev, el) => {
    const v = e.variantes[el.dataset.ajustar];
    if (!v) return;
    modalFormulario({
      titulo: 'Ajustar saldo — ' + [v.tamanho, v.cor].filter(Boolean).join('/'),
      campos: [
        { nome: 'qtdNova', rotulo: 'Quantidade contada', tipo: 'inteiro', obrigatorio: true, valor: v.saldo,
          dica: 'Saldo atual no sistema: ' + v.saldo },
        { nome: 'motivo', rotulo: 'Motivo', tipo: 'select', obrigatorio: true,
          opcoes: ['Inventário', 'Perda / avaria', 'Furto', 'Erro de lançamento', 'Devolução ao fornecedor', 'Peça de mostruário', 'Outro'] },
        { nome: 'obs', rotulo: 'Detalhe', attrs: 'placeholder="opcional"' },
        { nome: 'precoVenda', rotulo: 'Preço específico deste item', tipo: 'moeda',
          valor: v.precoVenda === null ? '' : v.precoVenda,
          dica: 'Deixe vazio para usar o preço do produto.' },
      ],
      aoSalvar: async (d, fechar) => {
        if (d.qtdNova !== v.saldo) {
          await acoes.ajustarEstoque(v.id, d.qtdNova, d.motivo + (d.obs ? ' — ' + d.obs : ''));
        }
        const novoPreco = d.precoVenda === 0 ? null : d.precoVenda;
        if (novoPreco !== v.precoVenda) await acoes.editarVariante(v.id, { precoVenda: novoPreco });
        fechar(); toast('Item atualizado.', 'ok');
      },
    });
  });
  void redesenhar;
}
