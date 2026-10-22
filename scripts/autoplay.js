(function () {
  var ticks = 0;
  var hist = [];

  var tick = setInterval(function () {
    if (++ticks > 5000) { clearInterval(tick); return; }
    var phase = document.body.dataset.phase;
    if (!phase) return;
    if (hist[hist.length - 1] !== phase) hist.push(phase);

    if (phase === 'ended') { clearInterval(tick); return; }

    if (phase === 'title') {
      var all = document.querySelectorAll('button');
      for (var i = 0; i < all.length; i++) {
        if (all[i].textContent.indexOf('开始') >= 0) { all[i].click(); return; }
      }
      return;
    }

    var opts = document.querySelectorAll('.option:not(:disabled)');
    if (opts.length > 0) {
      opts[0].click();
      setTimeout(function () {
        var bs = document.querySelectorAll('button');
        for (var j = 0; j < bs.length; j++) {
          if (bs[j].textContent.trim() === '继续') { bs[j].click(); return; }
        }
      }, 30);
      return;
    }

    var ends = document.querySelectorAll('button');
    for (var k = 0; k < ends.length; k++) {
      if (ends[k].textContent.indexOf('结束这一年') >= 0 && !ends[k].disabled) { ends[k].click(); return; }
    }
  }, 25);

  return 1;
})()
