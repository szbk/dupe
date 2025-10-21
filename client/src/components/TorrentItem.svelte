<script>
  export let t;
</script>

<div class="torrent">
  <div style="flex:1">
    <div style="font-weight:600;">{t.name}</div>
    <div class="progress"><div style="width:{t.progress * 100}%"></div></div>
    <div class="small">{Math.round(t.progress * 100)}% - {t.downloadSpeed} KB/s</div>
  </div>
</div>