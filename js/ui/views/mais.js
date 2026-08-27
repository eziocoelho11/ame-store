// mais.js — menu do celular para as telas que nao cabem na barra de baixo.
import * as log from '../../core/eventlog.js';
import * as sync from '../../core/sync.js';
import { brl, iso, competencia } from '../../core/fmt.js';
import { fluxoCaixaMensal } from '../../domain/consultas.js';
import { icone } from '../icones.js';
import { liga, toast , vista } from '../ui.js';
import { irPara } from '../router.js';

const ITENS = [
  ['/metas', 'raio', 'Metas', 'Meta de vendas do mês e provisões'],
  ['/vendas', 'recibo', 'Vendas', 'Histórico, devoluções e cancelamentos'],
  ['/clientes', 'pessoas', 'Clientes', 'Cadastro, histórico e fiado'],
  ['/despesas', 'documento', 'Despesas', 'O que sai, fixo e variável'],
  ['/dre', 'grafico', 'DRE', 'Resultado do mês e dos 12 meses'],
  ['/relatorios', 'filtro', 'Relatórios', 'Mais vendidos, curva ABC, giro'],
  ['/etiquetas', 'etiqueta', 'Etiquetas', 'Imprimir código de barras'],
  ['/ajustes', 'ajustes', 'Ajustes', 'Taxas, impostos, sincronia e backup'],
];

export async function render(raiz) {
  vista(raiz, html, ligar);
}

function html() {
  const e = log.estado();
  const hoje = iso();
  // Mesmo numero da caixinha da tela inicial: regime de caixa, nao competencia.
  const mes = fluxoCaixaMensal(e, { hoje, ano: Number(competencia(hoje).slice(0, 4)) })
    .meses.find((m) => m.corrente);
  const resultadoCaixa = mes ? mes.entradas - mes.saidas : 0;
  const s = sync.estadoSincronia();

  return `
  <div class="cartao">
    <div class="flex entre centro">
      <div>
        <div class="marca" style="font-size:1.5rem">A.M.E</div>
        <div class="texto-3 pequeno" style="letter-spacing:.2em">STORE</div>
      </div>
      <div style="text-align:right">
        <div class="texto-2 pequeno">Resultado do mês</div>
        <div class="negrito" style="font-size:1.2rem">${brl(resultadoCaixa)}</div>
      </div>
    </div>
  </div>

  <div class="cartao">
    <div class="lista">
      ${ITENS.map(([rota, ic, titulo, sub]) => `
        <div class="item" data-ir="${rota}">
          <div class="avatar">${icone(ic, 18)}</div>
          <div class="corpo"><div class="titulo">${titulo}</div><div class="sub">${sub}</div></div>
          <div class="valor">${icone('avancar', 16)}</div>
        </div>`).join('')}
    </div>
  </div>

  <div class="cartao">
    <div class="flex entre centro">
      <div class="pequeno texto-2">
        ${s.configurada ? `Sincronia ligada${s.ultima ? ' · ' + s.ultima : ''}` : 'Sincronia desligada'}
      </div>
      <button class="btn btn-p" data-acao="sync">${icone('sincronizar', 14)} Sincronizar</button>
    </div>
  </div>`;

}

function ligar(raiz) {
  liga(raiz, 'click', '[data-ir]', (ev, el) => irPara(el.dataset.ir));
  liga(raiz, 'click', '[data-acao="sync"]', async () => {
    try {
      const r = await sync.sincronizar({ manual: true });
      toast(r.desligada ? 'Sincronia não configurada. Veja em Ajustes.'
        : `Sincronizado — ${r.enviados} enviados, ${r.recebidos} recebidos.`, r.desligada ? '' : 'ok');
    } catch (err) { toast(err.message || 'Falhou.', 'erro'); }
  });
}
