// metas.js — a meta de vendas do mes e as provisoes (o que a loja se
// compromete a guardar). Meta batida muda a cara do cartao: e' o unico lugar do
// app onde o objetivo e' dar animo, nao so' informar.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import { resumoMeta, metasDoAno, fluxoCaixaMensal } from '../../domain/consultas.js';
import { brl, esc, iso, competencia, competenciaBR, competenciaCurta, MESES } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { barraMeta, liga, toast, tag, modalFormulario, confirmar, vista } from '../ui.js';

const NOMES_TIPO = { loja: 'venda na loja', fiado: 'fiado', dinheiro: 'dinheiro',
  pix: 'PIX', debito: 'débito', credito: 'crédito' };

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

function html() {
  const e = log.estado();
  const hoje = iso();
  const comp = competencia(hoje);
  const ano = Number(comp.slice(0, 4));
  const r = resumoMeta(e, comp);
  const doAno = metasDoAno(e, ano);
  const fluxo = fluxoCaixaMensal(e, { hoje, ano });
  const caixaDoMes = fluxo.meses.find((m) => m.comp === comp);
  const semMeta = !doAno.some((m) => m.meta > 0);

  return `
  ${semMeta ? `<div class="aviso aviso-info">${icone('info')}<div>
    <strong>Nenhuma meta definida ainda.</strong>
    Use "Editar metas" para dizer quanto a loja quer vender por mês. O app não inventa meta:
    esse número é decisão sua.</div></div>` : ''}

  ${cartaoDoMes(r)}

  ${cartaoProvisoes(r, caixaDoMes)}

  ${cartaoAno(doAno, comp)}

  <div class="barra-botoes">
    <button class="btn btn-primario" data-acao="editar-meta">${icone('editar', 16)} Editar metas</button>
    <button class="btn" data-acao="nova-provisao">${icone('mais', 16)} Nova provisão</button>
  </div>`;
}

function cartaoDoMes(r) {
  const veio = Object.entries(r.porTipo).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${esc(NOMES_TIPO[t] || t)} ${brl(v)}`).join(' · ');

  return `
  <div class="cartao ${r.batida ? 'meta-batida' : ''}">
    <div class="cartao-cabecalho">
      <div class="crescer">
        <h2>Meta de ${esc(competenciaBR(r.comp))}</h2>
        <div class="texto-2 pequeno">${r.meta > 0 ? 'meta de ' + brl(r.meta) : 'sem meta definida para este mês'}</div>
      </div>
      ${r.batida ? `<span class="selo-meta pulsa">${icone('check', 14)} Meta batida!</span>` : ''}
    </div>

    ${r.meta > 0 ? `
      ${barraMeta(r.pct, r.batida)}
      <div class="meta-numeros">
        <div><div class="rotulo">Já foi</div>
          <div class="valor ${r.batida ? 'positivo' : ''}">${brl(r.realizado)}</div></div>
        <div><div class="rotulo">${r.batida ? 'Passou da meta' : 'Falta'}</div>
          <div class="valor ${r.batida ? 'positivo' : ''}">${brl(r.batida ? r.excedente : r.falta)}</div></div>
        <div><div class="rotulo">Da meta</div>
          <div class="valor">${Math.round(r.pct)}%</div></div>
      </div>
      ${r.batida
        ? `<p class="dica">Mês fechado com folga de ${brl(r.excedente)} acima do combinado. 🎉</p>`
        : `<p class="dica">Faltam <strong>${brl(r.falta)}</strong> para bater a meta deste mês.</p>`}
    ` : ''}

    ${veio ? `<div class="legenda"><span>Veio de: ${veio}</span></div>` : ''}
    <p class="dica">Venda à vista, no cartão e no PIX contam no mês da venda. <strong>Fiado conta no mês em que
      a parcela vence</strong> — é a mesma regra da planilha, e é o que evita um mês inflado seguido de meses vazios.</p>
  </div>`;
}

function cartaoProvisoes(r, caixaDoMes) {
  if (!r.provisoes.length) {
    return `<div class="cartao"><h3>Provisões do mês</h3>
      <p class="texto-3 pequeno">Nenhuma provisão para ${esc(competenciaBR(r.comp))}.
      Provisão é o que a loja se compromete a guardar todo mês — reinvestimento, reserva, obra.</p></div>`;
  }
  const sobra = caixaDoMes ? caixaDoMes.entradas - caixaDoMes.saidas : 0;
  const cobre = sobra >= r.totalProvisoes;
  const faltaCaixa = Math.max(0, r.totalProvisoes - sobra);

  return `
  <div class="cartao">
    <h3>Provisões de ${esc(competenciaBR(r.comp))}</h3>
    <div class="lista">
      ${r.provisoes.map((p) => `
        <div class="item" style="cursor:default">
          <div class="corpo"><div class="titulo">${esc(p.nome)}</div>
            <div class="sub">${esc(competenciaCurta(p.de))} a ${esc(competenciaCurta(p.ate))}</div></div>
          <div class="valor">${brl(p.valor)}
            <small><button class="btn btn-p btn-fantasma" data-remover-provisao="${esc(p.id)}">Remover</button></small></div>
        </div>`).join('')}
    </div>
    <hr>
    <div class="flex entre">
      <span class="negrito">Total a guardar no mês</span>
      <span class="num negrito">${brl(r.totalProvisoes)}</span>
    </div>
    <div class="flex entre pequeno mt">
      <span class="texto-2">Sobrou de caixa no mês</span>
      <span class="num ${sobra < 0 ? 'negativo' : ''}">${brl(sobra)}</span>
    </div>
    ${cobre
      ? `<div class="aviso aviso-ok mt">${icone('check')}<div>
          <strong>O mês cobre as provisões.</strong> Sobrou ${brl(sobra - r.totalProvisoes)} depois de guardar tudo.</div></div>`
      : `<div class="aviso aviso-alerta mt">${icone('alerta')}<div>
          <strong>Faltam ${brl(faltaCaixa)} de caixa</strong> para guardar tudo o que foi provisionado neste mês.</div></div>`}
    <p class="dica">O app não sabe quanto você realmente separou — ele compara o que entrou menos o que saiu no mês
      com o total provisionado. Serve para responder "deu para guardar?", não para controlar a conta da reserva.</p>
  </div>`;
}

function cartaoAno(doAno, compAtual) {
  const comMeta = doAno.filter((m) => m.meta > 0);
  if (!comMeta.length) return '';
  const batidas = comMeta.filter((m) => m.batida).length;
  const passadas = comMeta.filter((m) => m.comp <= compAtual);

  return `
  <div class="cartao">
    <div class="cartao-cabecalho">
      <div class="crescer"><h3>O ano mês a mês</h3>
        <div class="texto-2 pequeno">${batidas} de ${passadas.length} ${passadas.length === 1 ? 'mês' : 'meses'} com meta até aqui ${batidas === 1 ? 'bateu' : 'bateram'}</div></div>
    </div>
    <div class="rolagem-x"><table>
      <thead><tr><th>Mês</th><th class="dir">Meta</th><th class="dir">Realizado</th>
        <th class="dir">Diferença</th><th></th></tr></thead>
      <tbody>${comMeta.map((m) => {
        const dif = m.realizado - m.meta;
        const futuro = m.comp > compAtual;
        return `<tr${m.comp === compAtual ? ' class="destaque-linha"' : ''}>
          <td>${esc(MESES[Number(m.comp.slice(5)) - 1])}${m.comp === compAtual ? ' <span class="texto-3 pequeno">(agora)</span>' : ''}</td>
          <td class="dir num">${brl(m.meta)}</td>
          <td class="dir num">${m.realizado ? brl(m.realizado) : '—'}</td>
          <td class="dir num ${futuro ? 'texto-3' : dif >= 0 ? 'positivo' : 'negativo'}">${m.realizado ? (dif >= 0 ? '+' : '') + brl(dif) : '—'}</td>
          <td class="dir">${m.batida ? tag('batida', 'ok') : futuro ? tag('a caminho') : tag(Math.round(m.pct) + '%', 'alerta')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="dica">Nos meses que ainda não chegaram, o realizado é o fiado <strong>já contratado</strong> —
      ele cresce com as vendas que ainda vão acontecer. Por isso a diferença desses meses aparece em cinza,
      e não em vermelho: não é meta perdida, é meta em andamento.</p>
  </div>`;
}

function ligar(raiz, redesenhar) {
  const e = log.estado();
  const comp = competencia(iso());
  const ano = Number(comp.slice(0, 4));
  const metas = e.config.metas || { vendasPadrao: 0, vendasPorMes: {}, provisoes: [] };

  const salvar = async (novas) => {
    await acoes.definirConfig('metas', novas);
    redesenhar();
  };

  liga(raiz, 'click', '[data-acao="editar-meta"]', () => {
    modalFormulario({
      titulo: 'Metas de venda',
      campos: [
        { nome: 'doMes', rotulo: `Meta de ${competenciaBR(comp)}`, tipo: 'moeda',
          valor: metas.vendasPorMes && metas.vendasPorMes[comp] },
        { nome: 'padrao', rotulo: 'Meta padrão dos demais meses', tipo: 'moeda', valor: metas.vendasPadrao,
          dica: 'Usada em todo mês que não tiver meta própria.' },
      ],
      aoSalvar: async (d, fechar) => {
        const novas = { ...metas, vendasPadrao: d.padrao || 0,
          vendasPorMes: { ...(metas.vendasPorMes || {}) } };
        if (d.doMes) novas.vendasPorMes[comp] = d.doMes;
        else delete novas.vendasPorMes[comp];
        await salvar(novas);
        fechar();
        toast('Metas salvas.', 'ok');
      },
    });
  });

  liga(raiz, 'click', '[data-acao="nova-provisao"]', () => {
    const opcoesMes = MESES.map((nome, i) => ({ v: `${ano}-${String(i + 1).padStart(2, '0')}`, t: `${nome}/${ano}` }));
    modalFormulario({
      titulo: 'Nova provisão',
      campos: [
        { nome: 'nome', rotulo: 'O que é', obrigatorio: true, valor: '' },
        { nome: 'valor', rotulo: 'Valor por mês', tipo: 'moeda', obrigatorio: true },
        { nome: 'de', rotulo: 'De', tipo: 'select', meia: true, opcoes: opcoesMes, valor: comp },
        { nome: 'ate', rotulo: 'Até', tipo: 'select', meia: true, opcoes: opcoesMes, valor: `${ano}-12` },
      ],
      aoSalvar: async (d, fechar) => {
        if (d.ate < d.de) { toast('O mês final não pode ser antes do inicial.', 'erro'); return; }
        const nova = { id: 'prov-' + Date.now().toString(36), nome: d.nome, valor: d.valor, de: d.de, ate: d.ate };
        await salvar({ ...metas, provisoes: [...(metas.provisoes || []), nova] });
        fechar();
        toast('Provisão criada.', 'ok');
      },
    });
  });

  liga(raiz, 'click', '[data-remover-provisao]', async (ev, el) => {
    const id = el.dataset.removerProvisao;
    const p = (metas.provisoes || []).find((x) => x.id === id);
    if (!p) return;
    const ok = await confirmar('Remover provisão', `"${p.nome}" sai de todos os meses.`, { textoOk: 'Remover', perigo: true });
    if (!ok) return;
    await salvar({ ...metas, provisoes: (metas.provisoes || []).filter((x) => x.id !== id) });
    toast('Provisão removida.');
  });
}
