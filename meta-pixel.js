/* Meta Pixel — MAZI General Trade
   Isang file lang para sa lahat ng pages. Para palitan ang Pixel ID, baguhin
   lang ang PIXEL_ID sa ibaba. Hindi ginagamit sa admin.html. */
(function(){
  var PIXEL_ID = '1697252918634640';

  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');

  // Safe helper: hindi masisira ang site kahit na-block ang pixel (adblock, atbp.)
  window.mazipx = function(evt, data){
    try { if (window.fbq) fbq('track', evt, data || {}); } catch(e){}
  };
})();
