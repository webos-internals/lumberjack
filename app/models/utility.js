function formatForHtml(string)
{
    string = string.escapeHTML();
    string = string.replace(/[\s]{2}/g, " &nbsp;");
    return string;
}

function copyLog(log, assistant)
{
	assistant.controller.stageController.setClipboard(log);
	Mojo.Controller.appController.removeBanner('lumbo-copy');
	Mojo.Controller.getAppController().showBanner({messageText: 'Log Copied', icon: 'icon.png'}, {source: 'lumbo-copy'});
}

function email(subject, message)
{
	
	var request = new Mojo.Service.Request("palm://com.palm.applicationManager",
	{
		method: 'open',
		parameters:
		{
			id: 'com.palm.app.email',
			params:
			{
				'summary':	subject,
				'text':		'<html><body>' + message + '</body></html>'
			}
		}
	});
	return request;
}