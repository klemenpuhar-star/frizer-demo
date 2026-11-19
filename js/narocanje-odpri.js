/* stran za narocanje: okno se odpre samo od sebe */
APP.ready.then(function(ok){ if(!ok) return; var b=document.querySelector('.open-modal'); if(b) b.click(); });
