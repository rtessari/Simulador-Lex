/**
 * Motor financeiro — Simulador de Financiamento Imobiliário
 * Exposto como window.Calc (IIFE, sem build tools necessário)
 */
(function (global) {
  'use strict';

  function combinedRate(inccPct, fixedPct) {
    return (1 + inccPct / 100) * (1 + fixedPct / 100) - 1;
  }

  /**
   * Tabela Price — parcela mensal (PMT)
   * Se r = 0, retorna pv / n
   */
  function pricePayment(pv, r, n) {
    if (n <= 0) return 0;
    if (Math.abs(r) < 1e-10) return pv / n;
    return pv * r / (1 - Math.pow(1 + r, -n));
  }

  function validateInputs(params) {
    var errors = [];
    var v     = params.totalValue;
    var e     = params.entrada;
    var n     = params.n;
    var nObra = params.nObra;
    var incc  = params.inccPct;
    var fixed = params.fixedPct;
    var rp    = params.reforcoPeriodico;

    if (!v || v <= 0)
      errors.push({ field: 'input-valor-imovel', msg: 'Valor do imóvel deve ser positivo' });

    if (e < 0)
      errors.push({ field: 'input-entrada', msg: 'Entrada não pode ser negativa' });

    if (v > 0 && e >= v)
      errors.push({ field: 'input-entrada', msg: 'Entrada deve ser menor que o valor do imóvel' });

    if (incc < 0)
      errors.push({ field: 'input-taxa-incc', msg: 'Taxa INCC não pode ser negativa' });

    if (fixed < 0)
      errors.push({ field: 'input-taxa-fixa', msg: 'Taxa Fixa não pode ser negativa' });

    if (!n || n <= 0 || !Number.isInteger(n))
      errors.push({ field: 'input-parcelas', msg: 'Número de parcelas deve ser um inteiro positivo' });

    if (n > 600)
      errors.push({ field: 'input-parcelas', msg: 'Máximo de 600 parcelas (50 anos)' });

    if (nObra > 0) {
      if (!Number.isInteger(nObra))
        errors.push({ field: 'input-n-obra', msg: 'Parcelas de obra deve ser um inteiro' });
      else if (n > 0 && nObra >= n)
        errors.push({ field: 'input-n-obra', msg: 'Parcelas de obra deve ser menor que o total de parcelas' });
    }

    if (rp && rp.ativo) {
      if (!rp.intervalo || rp.intervalo <= 0 || !Number.isInteger(rp.intervalo))
        errors.push({ field: 'input-reforcoPeriodico-intervalo', msg: 'Intervalo de reforço deve ser um inteiro positivo' });
      if (rp.valor <= 0)
        errors.push({ field: 'input-reforcoPeriodico-valor', msg: 'Valor do reforço periódico deve ser positivo' });
    }

    return errors;
  }

  /**
   * Constrói a tabela de amortização completa.
   *
   * Fase 1 (meses 1..nObra)  → taxa = INCC apenas
   * Fase 2 (meses nObra+1..n) → taxa = INCC + Taxa Fixa (combinada)
   *
   * Se nObra = 0, todos os meses usam a taxa combinada desde o início.
   */
  function buildSchedule(params) {
    var totalValue = params.totalValue;
    var entrada    = params.entrada    || 0;
    var incc       = params.inccPct    || 0;
    var fixed      = params.fixedPct   || 0;
    var n          = params.n;
    var nObra      = params.nObra      || 0;
    var rp         = params.reforcoPeriodico || { ativo: false };
    var rm         = params.reforcoManual    || [];

    var financedValue = totalValue - entrada;

    // Taxa fase 1: só INCC
    var r1 = incc / 100;
    // Taxa fase 2: INCC + fixo combinados
    var r2 = combinedRate(incc, fixed);

    // Monta Map<mês → valor total de reforço>
    var reforcoMap = {};
    if (rp.ativo && rp.intervalo > 0) {
      var rpValor = rp.tipo === 'percentual'
        ? (rp.valor / 100) * financedValue
        : rp.valor;
      for (var m = rp.intervalo; m <= n; m += rp.intervalo) {
        reforcoMap[m] = (reforcoMap[m] || 0) + rpValor;
      }
    }
    rm.forEach(function (item) {
      if (item.mes > 0 && item.mes <= n && item.valor > 0) {
        reforcoMap[item.mes] = (reforcoMap[item.mes] || 0) + item.valor;
      }
    });

    var balance = financedValue;
    // PMT inicial: fase 1 usa r1 para o total de n meses; se não há obra, usa r2
    var r_init = (nObra > 0 && nObra < n) ? r1 : r2;
    var pmt = pricePayment(balance, r_init, n);

    var schedule = [];
    var totalPmtPago    = 0;
    var totalReforcoPago = 0;
    var totalJurosPago  = 0;
    var pmtEntrega      = null; // PMT registrado na transição para fase 2

    for (var month = 1; month <= n; month++) {
      if (balance < 0.005) break;

      // Transição para fase 2: recalcula PMT com taxa combinada
      if (nObra > 0 && month === nObra + 1) {
        pmt = pricePayment(balance, r2, n - nObra);
        pmtEntrega = pmt;
      }

      var r_current = (nObra > 0 && month <= nObra) ? r1 : r2;
      var fase      = (nObra > 0 && month <= nObra) ? 'obra' : 'entrega';

      var juros       = balance * r_current;
      var amortizacao = pmt - juros;

      if (amortizacao > balance) {
        amortizacao = balance;
        pmt = amortizacao + juros;
      }

      balance -= amortizacao;
      balance = Math.round(balance * 100) / 100;

      var reforcoAmount = reforcoMap[month] || 0;
      if (reforcoAmount > balance) reforcoAmount = balance;
      balance -= reforcoAmount;
      balance = Math.max(0, Math.round(balance * 100) / 100);

      schedule.push({
        month: month,
        fase: fase,
        pmt: pmt,
        juros: juros,
        amortizacao: amortizacao,
        reforcoAmount: reforcoAmount,
        balance: balance
      });

      totalPmtPago     += pmt;
      totalReforcoPago += reforcoAmount;
      totalJurosPago   += juros;

      // Recalcula PMT após reforço (mantém taxa da fase atual)
      if (reforcoAmount > 0 && balance > 0.005 && month < n) {
        var r_fase = (nObra > 0 && month < nObra) ? r1 : r2;
        pmt = pricePayment(balance, r_fase, n - month);
        if (fase === 'entrega' && pmtEntrega === null) pmtEntrega = pmt;
      }

      if (balance < 0.005) break;
    }

    var firstPmt   = schedule.length > 0 ? schedule[0].pmt : 0;
    var totalPaid  = totalPmtPago + totalReforcoPago;

    // Se não há fase de obra, pmtEntrega = firstPmt (taxa combinada desde o início)
    if (pmtEntrega === null) pmtEntrega = firstPmt;

    var summary = {
      totalValue:       totalValue,
      entrada:          entrada,
      financedValue:    financedValue,
      inccPct:          incc,
      fixedPct:         fixed,
      rCombined:        r2,
      nObra:            nObra,
      pmtObra:          nObra > 0 ? firstPmt : null,
      pmtEntrega:       pmtEntrega,
      firstPmt:         firstPmt,
      totalPmtPago:     totalPmtPago,
      totalReforcoPago: totalReforcoPago,
      totalPaid:        totalPaid,
      totalJuros:       totalJurosPago,
      finalMonth:       schedule.length > 0 ? schedule[schedule.length - 1].month : 0
    };

    return { schedule: schedule, summary: summary };
  }

  global.Calc = {
    combinedRate:   combinedRate,
    pricePayment:   pricePayment,
    validateInputs: validateInputs,
    buildSchedule:  buildSchedule
  };

}(typeof window !== 'undefined' ? window : this));
