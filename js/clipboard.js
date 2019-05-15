$(document).ready(function () {
	if (!OCA.Files) return;

	var appid = 'files_clipboard';
	var $fileList = $('#fileList');
	var clipboard = getClipboard();

	// Periodically sync the clipboard to update new tabs
	var $syncInterval = setInterval(function() { if (clipboard) { syncClipboards(); }}, 1000);

	// Add listener for storages to keep them in sync across tabs
	window.addEventListener('storage', syncClipboardStorages); 


	// The main action buttons
	var $cutButton = $('<a/>')
		.attr('id', 'clipboard_cut')
		.append($('<img/>').addClass('svg').attr('src', OC.imagePath(appid, 'cut')))
		.append(' ')
		.append($('<span/>').text(t(appid, 'Cut')))
		.on('click', function () { cut(); })
		.hide()
		.appendTo('#headerName .selectedActions');

	var $copyButton = $('<a/>')
		.attr('id', 'clipboard_copy')
		.append($('<img/>').addClass('svg').attr('src', OC.imagePath(appid, 'copy')))
		.append(' ')
		.append($('<span/>').text(t(appid, 'Copy')))
		.on('click', function () { copy(); })
		.hide()
		.appendTo('#headerName .selectedActions');

	var $pasteButton = $('<a/>')
		.attr('id', 'clipboard_paste')
		.append($('<img/>').addClass('svg').attr('alt', t(appid, 'Paste')).attr('src', OC.imagePath(appid, 'paste')))
		.addClass('button')
		.on('click', paste)
		.hide()
		.appendTo('#controls .creatable');

	// Watch for envents on the file list
	$fileList.on('changeDirectory', function () {
		$fileList.off('DOMNodeRemoved', onRowRemoved);
	});
	$fileList.on('fileActionsReady', function () {
		$fileList.on('DOMNodeRemoved', onRowRemoved);
	});

	// Actions menu options
	OCA.Files.fileActions.registerAction({
		name: 'Cut',
		displayName: t('files_clipboard', 'Cut'),
		mime: 'all',
		order: -10,
		permissions: OC.PERMISSION_READ,
		icon: OC.imagePath('files_clipboard', 'cut.svg'),
		actionHandler: cut
	});
	OCA.Files.fileActions.registerAction({
		name: 'Copy',
		displayName: t('files_clipboard', 'Copy'),
		mime: 'all',
		order: -9,
		permissions: OC.PERMISSION_READ,
		icon: OC.imagePath('files_clipboard', 'copy.svg'),
		actionHandler: copy
	});

	function onRowRemoved(event) {
		var $target = $(event.target);
		if (clipboard && clipboard.directory == $('#dir').val() && $target.is('tr[data-file]')) {
			var fileIndex = clipboard.files.indexOf($target.attr('data-file'));
			if (fileIndex != -1) {
				clipboard = setClipboard(clipboard.operation, clipboard.directory, clipboard.files.splice(fileIndex, 1));
				if (!clipboard.files.length) {
					clipboard = clearClipboard();
				}
			}
			update();
		}
	}

	function update() {
		var permissions = parseInt($('#permissions').val());

		$cutButton.toggle((permissions & OC.PERMISSION_READ && permissions & OC.PERMISSION_UPDATE) != 0);
		$copyButton.toggle((permissions & OC.PERMISSION_READ) != 0);

		if (clipboard) {
			var sameDirectory = clipboard.directory == $('#dir').val(),
				noPermissions = !(permissions & OC.PERMISSION_CREATE),
				disabled = noPermissions || sameDirectory,
				title;
			if (sameDirectory) {
				title = t(appid, 'Unable to paste: the files come from this directory.');
			} else if (noPermissions) {
				title = t(appid, 'Unable to paste: you do not have the permissions to create files in this directory.');
			}
			else {
				title = n(appid, 'Paste %n item', 'Paste %n items', clipboard.files.length);
			}

			$pasteButton
				.toggleClass('disabled', disabled)
				.attr('title', title)
				.tipsy({ gravity: 'ne', fade: true })
				.show();

			if (clipboard.operation == 'cut' && clipboard.directory == $('#dir').val()) {
				var $trs = $('tr', $fileList);
				clipboard.files.forEach(function (file) {
					$trs.filterAttr('data-file', file).addClass('cut');
				});
			}
			if (!clipboard.operation) {
				$pasteButton.hide();
			}
		} else {
			$pasteButton.hide();
		}
	};

	function clearCut() {
		$('tr[data-file]', $fileList).removeClass('cut');
	}

	// Setup the clipboard for a cut
	function cut(file) {
		var files = file ? [file] : FileList.getSelectedFiles().map(function (file) { return file.name; });
		setClipboard('cut', $('#dir').val(), files);
		syncClipboards();
		clearCut();
		clearSelection();
		update();
	}

	// Setup the clipboard for a copy
	function copy(file) {
		var files = file ? [file] : FileList.getSelectedFiles().map(function (file) { return file.name; });
		setClipboard('copy', $('#dir').val(), files);
		syncClipboards();
		clearCut();
		clearSelection();
		update();
	}

	function clearSelection() {
		$('tr[data-file]', $fileList).removeClass('selected');
		$('tr[data-file] input[type="checkbox"]', $fileList).removeAttr('checked');
		FileList._selectedFiles = {};
		FileList._selectionSummary.clear();
		FileList.updateSelectionSummary();
	}

	// Retrieve the session's stored clipboard
	function getClipboard() {
		stored_clipboard = sessionStorage.getItem(appid);
		if (stored_clipboard) {
			stored_clipboard = JSON.parse(stored_clipboard);
			if (stored_clipboard.user !== OC.currentUser) {
				stored_clipboard = clearClipboard();
			}
			return stored_clipboard;
		}
		return null;
	}

	// Clear the clipboard
	function clearClipboard() {
		sessionStorage.removeItem(appid);
		$pasteButton.hide();
		syncClipboards();
		return null;
	}

	// Set the clipboard
	function setClipboard(operation, dir, files) {
		clipboard = { user: OC.currentUser, operation: operation, directory: dir, files: files };
		sessionStorage.removeItem(appid);
		sessionStorage.setItem(appid, JSON.stringify(clipboard));
		$pasteButton.show();	
		return getClipboard();
	}

	// Trigger a clipboard sync across windows/tabs
	function syncClipboards() {
		localStorage.setItem('syncClipboards', JSON.stringify(getClipboard()));
		localStorage.removeItem('syncClipboards');
	}

	// Syncs a clipboard across multiple windows/tabs using localStorage
	function syncClipboardStorages(e) {
		if(e.storageArea===localStorage) {
			if (event.key === 'syncClipboards' && event.newValue) {
				new_clipboard = JSON.parse(event.newValue);
				local_clipboard = JSON.stringify(getClipboard());
				if (event.newValue && event.newValue !== local_clipboard) {
					if (new_clipboard && new_clipboard.hasOwnProperty('operation') && OC.currentUser == new_clipboard.user) {
						setClipboard(new_clipboard.operation, new_clipboard.directory, new_clipboard.files);
					} else {
						clearClipboard();
					}
					update();
				}
			}
		}
	}

	// The actual paste method
	function paste() {
		if ($(this).hasClass('disabled')) return;
		FileList.showMask();
		$(window).on('beforeunload', processing);
		replaceExistingFiles(function (replace) {
			if (!replace) {
				FileList.hideMask();
			} else {
				clipboard = getClipboard();
				var destination = $('#dir').val();
				var promises = clipboard.files.map(function (file) {
					var headers = {
						'Destination': FileList.filesClient._buildUrl(destination, file)
					};
					return FileList.filesClient._client.request(
						clipboard.operation == 'cut' ? 'MOVE' : 'COPY',
						FileList.filesClient._buildUrl(clipboard.directory, file),
						headers
					).then(function (response) {
						if (response.status >= 200 && response.status < 300) {
							return true;
						} else {
							console.error(response.status, response.xhr.responseXML || response.xhr.responseText);
							return file;
						}
					});
				});

				Promise.all(promises).then(function (results) {
					var rejectedFiles = results.filter(function (item) { return item !== true });
					if (rejectedFiles.length) {
						var message;
						if (clipboard.operation == 'cut') {
							message = '<b>' + t(appid, "An error occurred during the move.") + '</b>';
						} else {
							message = '<b>' + t(appid, "An error occurred during the copy.") + '</b>';
						}
						message += '<p class="files_clipboard_error">';
						for (var i = rejectedFiles.length - 1; i >= 0; --i) {
							message += rejectedFiles[i] + '<br>';
						}
						message += '</p>';
						OC.Notification.showHtml(message, { type: 'error' });
					}
						
					if (clipboard.operation == 'cut') {
						clipboard = clearClipboard();
						$pasteButton.hide();
					}
					$(window).off('beforeunload', processing);
					FileList.reload();
				})
				.catch(function (error) {
					console.error(error);
				});
			}
		});
	}

	// Message to return while processing
	function processing() {
		if (clipboard.operation == 'cut') {
			message = t(appid, 'Processing. Leaving the page now will interrupt the move.');
		} else {
			message = t(appid, 'Processing. Leaving the page now will interrupt the copy.');
		}
	}

	// Prompt if there is existing files with the same name
	function replaceExistingFiles(callback) {
		clipboard = getClipboard();
		var $trs = $('tr', $fileList);
		var existing = clipboard.files.filter(function (file) {
			return $trs.filterAttr('data-file', file).attr('data-file');
		});
		if (!existing.length) {
			callback(true);
		}
		else {
			var message = t(appid, 'The contents of the clipboard is in conflicts with elements already present in this directory. Do you want to replace them ?');
			OC.dialogs.confirm(message, t(appid, 'Paste'), callback, true);
		}
	}

	$fileList.on('updated', update);
	update();

});
