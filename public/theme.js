// Applies the theme before first paint so there's no flash. Default is dark;
// only an explicit stored 'light' opts out. ?theme=light|dark sets it.
;(function () {
  try {
    var q = new URLSearchParams(location.search).get('theme')
    if (q === 'light' || q === 'dark') localStorage.setItem('theme', q)
    if (localStorage.getItem('theme') !== 'light') document.documentElement.classList.add('dark')
  } catch (e) {
    document.documentElement.classList.add('dark')
  }
})()
