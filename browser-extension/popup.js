const status=document.getElementById("status");
document.getElementById("copy").addEventListener("click",async()=>{
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.url || !/^https?:/.test(tab.url)) throw new Error("Open a public job or recruitment webpage first.");
    const payload=["Page title: "+(tab.title||"Not available"),"Page URL: "+tab.url].join("\n");
    await navigator.clipboard.writeText(payload);
    status.textContent="Copied. Paste the page details into an OfferShield investigation.";
  }catch(error){status.textContent=error.message||"Could not copy this page.";}
});