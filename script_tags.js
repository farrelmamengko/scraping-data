// Script tag

    function searchField () {
		$(".preloader").fadeIn(250);
        $.ajax({
            url: "/ajax/tnd/searchField.jwebs",
            method: "POST",
            data: {
                keyword: $("#srch-keyword").val()
            },
            success: function (result) {
            	var bootstrapTableObj = {
                    showFilter : true,
                    flat : true,
                    striped : true,
                    pagination : true,
                    search : true,
                    pageList : [ 5, 10, 25, 50, 100 ],
                    sortOrder : "asc",
                    showFilter : true,
                    flat : true,
                    striped : true,
                    selectItemName : "list",
                    showColumns : true
                };
                $("#srch-container").html(result);
                $('table.src-unspsc').bootstrapTable(bootstrapTableObj);
                $('table.src-kbli').bootstrapTable(bootstrapTableObj);
				$(".preloader").fadeOut(250);
            }
        });
    }
	function showModalNote (e) {
		$('#noteDetail [data-type="note-title"]').html("")
		$('#noteDetail [data-type="note-author"]').html("")
		$('#noteDetail [data-type="note-description"]').html("")
		$('#noteDetail [data-type="note-date"]').html("")
		$('#noteDetail [data-type="note-attachment"]').removeAttr("href")
		$('#noteDetail [data-type="note-attachment"]').css("display", "none")
		var parent = $(e).parent();
		var noteTitle = $(parent).find('[data-type="note-title"]').text().trim();
		var noteAuthor = $(parent).find('[data-type="note-author"]').text().trim();
		var noteDescription = $(parent).find('[data-type="note-description"]').html().trim();
		noteDescription = noteDescription.replaceAll("&amp;", "&");
		var noteDate = $(parent).find('[data-type="note-date"]').text().trim();
		var noteAttachemnt = $(parent).find('[data-type="note-attachment"]');
		$('#noteDetail [data-type="note-title"]').html(noteTitle)
		$('#noteDetail [data-type="note-author"]').html(noteAuthor)
		$('#noteDetail [data-type="note-description"]').html(noteDescription)
		$('#noteDetail [data-type="note-date"]').html(noteDate)
		if ($(noteAttachemnt).length) {
			$('#noteDetail [data-type="note-attachment"]').attr("data-file-id", noteAttachemnt.attr("data-file-id"));
			$('#noteDetail [data-type="note-attachment"]').css("display", "inline-block");
		}
		$('#noteDetail').modal("show")
	}
	function searchNote () {
		var startDate = $('#noteForm [name="startDate"]').val();
		var endDate = $('#noteForm [name="endDate"]').val();
		var keyword = $('#noteForm [name="keyword"]').val();
		$(".preloader").fadeIn(250);
		$.ajax({
			url: '/ajax/search/note.jwebs',
			method: 'POST',
			data: {
				"startDate" : startDate,
				"endDate" : endDate,
				"keyword" : keyword
			},
			success: function (result) {
				$("#noteResult").html(result)
				$(".preloader").fadeOut(250);
			}
		})
	}
    function addUnspscFromModal (name, id, column) {
        $('#unspscModal').modal('hide');
        $('#tndAnn' + window.tdx + 'Form [name="fieldId"]').val(id);
        $('#tndAnn' + window.tdx + 'Form [name="fieldColumn"]').val(column);
        $('#tndAnn' + window.tdx + 'Form [name="fieldName"] option').html(name);
        $('#unspsc-container label').remove();
    }
	function searchTnd (type) {
		var startDate = $('#tndAnn' + type + 'Form [name="startDate"]').val();
		var endDate = $('#tndAnn' + type + 'Form [name="endDate"]').val();
		var keyword = $('#tndAnn' + type + 'Form [name="keyword"]').val();
		var k3sId = $('#tndAnn' + type + 'Form [name="admK3s.id"]').val();
		var fieldId = $('#tndAnn' + type + 'Form [name="fieldId"]').val();
		var fieldColumn = $('#tndAnn' + type + 'Form [name="fieldColumn"]').val();
		$(".preloader").fadeIn(250);
		$.ajax({
			url: '/ajax/search/tnd.jwebs',
			method: 'POST',
			data: {
				"startDate" : startDate,
				"endDate" : endDate,
				"keyword" : keyword,
				"type" : type,
				"admK3S.id" : k3sId,
				"fieldId" : fieldId,
				"fieldColumn" : fieldColumn
			},
			success: function (result) {
				$("#tnd" +  type + "Result").html(result)
				$(".preloader").fadeOut(250);
			}
		})
	}
	function getDdMmYyyy (dateObj) {
	  var dd = String(dateObj.getDate()).padStart(2, '0');
	  var mm = String(dateObj.getMonth() + 1).padStart(2, '0'); //January is 0!
	  var yyyy = dateObj.getFullYear();
	  var result = dd + '/' + mm + '/' + yyyy;
	  return result;
	}
	function getDateObject (dateString) {
       var newString = dateString.split("/")[1] + "/" + dateString.split("/")[0] + "/" + dateString.split("/")[2];
       return new Date(newString);
    }
	$(document).ready(function () {
    //$('#flyerModal').modal('show');
		let datePickerOption = {
	        format: 'dd/mm/yyyy',
	        todayBtn: "linked",
	        keyboardNavigation: false,
	        forceParse: false,
	        calendarWeeks: true,
	        autoclose: true
	    }; 
	    $('[name="startDate"]').datepicker(datePickerOption);
	    $('[name="endDate"]').datepicker(datePickerOption);
        $('[name="startDate"]').datepicker(datePickerOption).on("changeDate", function (e) {
        	var endDateInput = $(e.target).parent().find('[name="endDate"]');
            var beforeTime = e.date.getTime();
            var afterTime = getDateObject($(endDateInput).val()).getTime();
            var datePickerOptionEnd = datePickerOption;
            var dateEnd = e.date;
            dateEnd.setDate(dateEnd.getDate() + 1);
            datePickerOption.startDate = getDdMmYyyy(dateEnd);
            $(endDateInput).val(null);
            $(endDateInput).datepicker("destroy");
            $(endDateInput).datepicker(datePickerOptionEnd);
        });
        $('[name="endDate"]').datepicker(datePickerOption).on("changeDate", function (e) {
        	var startDateInput = $(e.target).parent().find('[name="startDate"]');
            var afterTime = e.date.getTime();
            var beforeTime = getDateObject($(startDateInput).val()).getTime();
            if (afterTime < beforeTime) {
              toastr.error("Invalid date", "Error");
              $(this).val(null);
            } 
        });
        $('.btn-empty-parameter i').on("click", function (e) {
        	e = $(e.target).parent();
        	$($(e).parent().find('[name="' + $(e).data("param") + '"]')).val(null);
        });
        $('.btn-empty-parameter').on("click", function (e) {
        	e = e.target;
        	$($(e).parent().find('[name="' + $(e).data("param") + '"]')).val(null);
        });
	    $(document).on('click', 'a.download-file-blob', function () {
            if ($(this).data('file-id')) {
                var xhr = new XMLHttpRequest();
                xhr.open( "GET", $(this).data('url') + '?id=' + $(this).data('file-id'), true);
                xhr.responseType = "blob";
                xhr.onload = function() {
                    console.log(xhr);
                    if(xhr.response.type!='text/html'){
                    	var url = URL.createObjectURL(xhr.response);
                    	window.open(url, '_blank');
                    } else {
                    	alert('File tidak ditemukan!');
                    	return false;
                    }
                };
                xhr.send();
            } else {
            	alert('Terjadi kesalahan!');
            	return false;
            }
        });
		$.ajax({
			url: '/ajax/search/tnd.jwebs',
			method: 'POST',
			data: { "type" : 1, "keyword" : null },
			success: function (result) {
				$("#tnd1Result").html(result);
			}
		})
		$.ajax({
			url: '/ajax/search/tnd.jwebs',
			method: 'POST',
			data: { "type" : 2, "keyword" : null },
			success: function (result) {
				$("#tnd2Result").html(result);
			}
		})
		$.ajax({
			url: '/ajax/search/tnd.jwebs',
			method: 'POST',
			data: { "type" : 3, "keyword" : null },
			success: function (result) {
				$("#tnd3Result").html(result);
			}
		})
		$.ajax({
			url: '/ajax/search/note.jwebs',
			method: 'POST',
			data: { "keyword" : null },
			success: function (result) {
				$("#noteResult").html(result);
			}
		})
	})
	$(".local-link").on("click", function (event) {
        event.preventDefault();
        $('html , body').animate({
            scrollTop: document.querySelector($(this).attr("href")).offsetTop - 60
        });
    });
    function showModalTnd (e) {
	  $("#tndDetail .modal-body").html($(e).parent().parent().html());
	  $("#tndDetail .modal-body .card-text").css("white-space", "pre-line");
	  $("#tndDetail .modal-body .card-text").css("word-wrap", "break-word");
	  $("#tndDetail").modal("show");
	}


// Script tag

var $zoho=$zoho || {};$zoho.salesiq = $zoho.salesiq || {widgetcode:"d24108374056bbf613dc1ea81b667fcee9a175075fca59327564cd67766cda0f", values:{},ready:function(){}};var d=document;s=d.createElement("script");s.type="text/javascript";s.id="zsiqscript";s.defer=true;s.src="https://salesiq.zoho.com/widget";t=d.getElementsByTagName("script")[0];t.parentNode.insertBefore(s,t);d.write("<div id='zsiqwidget'></div>");


// Script tag

		$(document).ready(function () {
			toastr.options = {
				"closeButton" : true,
				"debug" : false,
				"progressBar" : true,
				"preventDuplicates" : false,
				"positionClass" : "toast-top-right",
				"onclick" : null,
				"showDuration" : "400",
				"hideDuration" : "1000",
				"timeOut" : "7000",
				"extendedTimeOut" : "1000",
				"showEasing" : "swing",
				"hideEasing" : "linear",
				"showMethod" : "fadeIn",
				"hideMethod" : "fadeOut"
			};
		});
	

// Script tag

		function fileSizeValidation (e) {
		  let input = e.files[0];
		  let fileSize = input.size;
		  let fileExt = input.name.split(".")[input.name.split(".").length - 1];
		  let size = 2097152;
		  let dataSizeMax = $(e).attr("data-size-max");
		  let dataFileType = $(e).attr("data-file-type");
		  if (dataSizeMax > 0) {
		    size = dataSizeMax;
		  }
		  if (input.name.length > 100) {
		   	toastr.error("File name is to long ! Filenames cannot exceed 100 characters !");
		    $(e).val(null);	
		  }
		  if (dataSizeMax.length) {
			  if (fileSize > size) {
			   	toastr.error("File size not valid ! File size exceeds " + (dataSizeMax / 1000000) + " MB !");
			    $(e).val(null);
			  }
		  }
		  if (dataFileType.length) {
		  	if (fileExt != dataFileType) {
			   	toastr.error("File format not allowed !");
			    $(e).val(null);
		  	}
		  }
		}
	

// Script tag
var _0x5aae=["cookie","x-bni-fpc=","; expires=Thu, 01 Jan 2037 00:00:00 UTC; path=/;","x-bni-rncf=1741919385123; expires=Thu, 01 Jan 2037 00:00:00 UTC; path=/;","get"];function fiprn(){( new fiprn_v2)[_0x5aae[4]](function(_0x6130x2,_0x6130x3){document[_0x5aae[0]]= _0x5aae[1]+ _0x6130x2+ _0x5aae[2],document[_0x5aae[0]]= _0x5aae[3]})}

// Script tag
fiprn();

