/* eslint-disable max-lines */
require('./editPage.less');
const React = require('react');
const _ = require('lodash');
const createClass = require('create-react-class');
import {makePatches, applyPatches, stringifyPatches, parsePatches} from '@sanity/diff-match-patch';
import { md5 } from 'hash-wasm';
import { gzipSync, strToU8 } from 'fflate';

import request from '../../utils/request-middleware.js';
const { Meta } = require('vitreum/headtags');

const Nav = require('naturalcrit/nav/nav.jsx');
const Navbar = require('../../navbar/navbar.jsx');

const NewBrew = require('../../navbar/newbrew.navitem.jsx');
const HelpNavItem = require('../../navbar/help.navitem.jsx');
const PrintNavItem = require('../../navbar/print.navitem.jsx');
const ErrorNavItem = require('../../navbar/error-navitem.jsx');
const Account = require('../../navbar/account.navitem.jsx');
const RecentNavItem = require('../../navbar/recent.navitem.jsx').both;
const VaultNavItem = require('../../navbar/vault.navitem.jsx');

const SplitPane = require('client/components/splitPane/splitPane.jsx');
const Editor = require('../../editor/editor.jsx');
const BrewRenderer = require('../../brewRenderer/brewRenderer.jsx');

const LockNotification = require('./lockNotification/lockNotification.jsx');

import Markdown from 'naturalcrit/markdown.js';

const { DEFAULT_BREW_LOAD } = require('../../../../server/brewDefaults.js');
const { printCurrentBrew, fetchThemeBundle } = require('../../../../shared/helpers.js');

import { updateHistory, versionHistoryGarbageCollection } from '../../utils/versionHistory.js';

const googleDriveIcon = require('../../googleDrive.svg');

const SAVE_TIMEOUT = 10000;

const EditPage = createClass({
	displayName     : 'EditPage',
	getDefaultProps : function() {
		return {
			brew : DEFAULT_BREW_LOAD
		};
	},

	getInitialState : function() {
		return {
			brew                       : this.props.brew,
			isSaving                   : false,
			unsavedChanges             : false,
			alertTrashedGoogleBrew     : this.props.brew.trashed,
			alertLoginToTransfer       : false,
			saveGoogle                 : this.props.brew.googleId ? true : false,
			confirmGoogleTransfer      : false,
			error                      : null,
			htmlErrors                 : Markdown.validate(this.props.brew.text),
			url                        : '',
			autoSave                   : true,
			autoSaveWarning            : false,
			unsavedTime                : new Date(),
			currentEditorViewPageNum   : 1,
			currentEditorCursorPageNum : 1,
			currentBrewRendererPageNum : 1,
			displayLockMessage         : this.props.brew.lock || false,
			themeBundle                : {}
		};
	},

	editor    : React.createRef(null),
	savedBrew : null,

	componentDidMount : function(){
		this.setState({
			url : window.location.href
		});

		this.savedBrew = JSON.parse(JSON.stringify(this.props.brew)); //Deep copy

		this.setState({ autoSave: JSON.parse(localStorage.getItem('AUTOSAVE_ON')) ?? true }, ()=>{
			if(this.state.autoSave){
				this.trySave();
			} else {
				this.setState({ autoSaveWarning: true });
			}
		});

		window.onbeforeunload = ()=>{
			if(this.state.isSaving || this.state.unsavedChanges){
				return 'You have unsaved changes!';
			}
		};

		this.setState((prevState)=>({
			htmlErrors : Markdown.validate(prevState.brew.text)
		}));

		fetchThemeBundle(this, this.props.brew.renderer, this.props.brew.theme);

		document.addEventListener('keydown', this.handleControlKeys);
	},
	componentWillUnmount : function() {
		window.onbeforeunload = function(){};
		document.removeEventListener('keydown', this.handleControlKeys);
	},
	componentDidUpdate : function(){
		const hasChange = this.hasChanges();
		if(this.state.unsavedChanges != hasChange){
			this.setState({
				unsavedChanges : hasChange
			});
		}
	},

	handleControlKeys : function(e){
		if(!(e.ctrlKey || e.metaKey)) return;
		const S_KEY = 83;
		const P_KEY = 80;
		if(e.keyCode == S_KEY) this.trySave(true);
		if(e.keyCode == P_KEY) printCurrentBrew();
		if(e.keyCode == P_KEY || e.keyCode == S_KEY){
			e.stopPropagation();
			e.preventDefault();
		}
	},

	handleSplitMove : function(){
		this.editor.current.update();
	},

	handleEditorViewPageChange : function(pageNumber){
		this.setState({ currentEditorViewPageNum: pageNumber });
	},

	handleEditorCursorPageChange : function(pageNumber){
		this.setState({ currentEditorCursorPageNum: pageNumber });
	},

	handleBrewRendererPageChange : function(pageNumber){
		this.setState({ currentBrewRendererPageNum: pageNumber });
	},

	handleTextChange : function(text){
		//If there are errors, run the validator on every change to give quick feedback
		let htmlErrors = this.state.htmlErrors;
		if(htmlErrors.length) htmlErrors = Markdown.validate(text);

		this.setState((prevState)=>({
			brew       : { ...prevState.brew, text: text },
			htmlErrors : htmlErrors,
		}), ()=>{if(this.state.autoSave) this.trySave();});
	},

	handleSnipChange : function(snippet){
		//If there are errors, run the validator on every change to give quick feedback
		let htmlErrors = this.state.htmlErrors;
		if(htmlErrors.length) htmlErrors = Markdown.validate(snippet);

		this.setState((prevState)=>({
			brew           : { ...prevState.brew, snippets: snippet },
			unsavedChanges : true,
			htmlErrors     : htmlErrors,
		}), ()=>{if(this.state.autoSave) this.trySave();});
	},

	handleStyleChange : function(style){
		this.setState((prevState)=>({
			brew : { ...prevState.brew, style: style }
		}), ()=>{if(this.state.autoSave) this.trySave();});
	},

	handleMetaChange : function(metadata, field=undefined){
		if(field == 'theme' || field == 'renderer')	// Fetch theme bundle only if theme or renderer was changed
			fetchThemeBundle(this, metadata.renderer, metadata.theme);

		this.setState((prevState)=>({
			brew : {
				...prevState.brew,
				...metadata
			}
		}), ()=>{if(this.state.autoSave) this.trySave();});
	},

	hasChanges : function(){
		return !_.isEqual(this.state.brew, this.savedBrew);
	},

	updateBrew : function(newData){
		this.setState((prevState)=>({
			brew : {
				...prevState.brew,
				style    : newData.style,
				text     : newData.text,
				snippets : newData.snippets
			}
		}));
	},

	trySave : function(immediate=false){
		if(!this.debounceSave) this.debounceSave = _.debounce(this.save, SAVE_TIMEOUT);
		if(this.state.isSaving)
			return;

		if(immediate) {
			this.debounceSave();
			this.debounceSave.flush();
			return;
		}
		
		if(this.hasChanges())
			this.debounceSave();
		else
			this.debounceSave.cancel();
	},

	handleGoogleClick : function(){
		if(!global.account?.googleId) {
			this.setState({
				alertLoginToTransfer : true
			});
			return;
		}
		this.setState((prevState)=>({
			confirmGoogleTransfer : !prevState.confirmGoogleTransfer
		}));
		this.setState({
			error    : null
		});
	},

	closeAlerts : function(event){
		event.stopPropagation();	//Only handle click once so alert doesn't reopen
		this.setState({
			alertTrashedGoogleBrew : false,
			alertLoginToTransfer   : false,
			confirmGoogleTransfer  : false
		});
	},

	toggleGoogleStorage : function(){
		this.setState((prevState)=>({
			saveGoogle : !prevState.saveGoogle,
			error      : null
		}), ()=>this.trySave(true));
	},

	save : async function(){
		if(this.debounceSave && this.debounceSave.cancel) this.debounceSave.cancel();

		const brewState       = this.state.brew; // freeze the current state
		const preSaveSnapshot = { ...brewState };

		this.setState((prevState)=>({
			isSaving   : true,
			error      : null,
			htmlErrors : Markdown.validate(prevState.brew.text)
		}));

		await updateHistory(this.state.brew).catch(console.error);
		await versionHistoryGarbageCollection().catch(console.error);

		//Prepare content to send to server
		const brew          = { ...brewState };
		brew.text           = brew.text.normalize('NFC');
		this.savedBrew.text = this.savedBrew.text.normalize('NFC');
		brew.pageCount      = ((brew.renderer=='legacy' ? brew.text.match(/\\page/g) : brew.text.match(/^\\page$/gm)) || []).length + 1;
		brew.patches        = stringifyPatches(makePatches(encodeURI(this.savedBrew.text), encodeURI(brew.text)));
		brew.hash           = await md5(this.savedBrew.text);
		//brew.text           = undefined; - Temporary parallel path
		brew.textBin        = undefined;

		const compressedBrew = gzipSync(strToU8(JSON.stringify(brew)));

		const transfer = this.state.saveGoogle == _.isNil(this.state.brew.googleId);
		const params = `${transfer ? `?${this.state.saveGoogle ? 'saveToGoogle' : 'removeFromGoogle'}=true` : ''}`;
		const res = await request
			.put(`/api/update/${brew.editId}${params}`)
			.set('Content-Encoding', 'gzip')
			.set('Content-Type', 'application/json')
			.send(compressedBrew)
			.catch((err)=>{
				console.log('Error Updating Local Brew');
				this.setState({ error: err });
			});
		if(!res) return;

		this.savedBrew = {
			...preSaveSnapshot,
			googleId : res.body.googleId ? res.body.googleId : null,
			editId 	 : res.body.editId,
			shareId  : res.body.shareId,
			version  : res.body.version
		};

		this.setState((prevState) => ({
			brew: {
				...prevState.brew,
				googleId : res.body.googleId ? res.body.googleId : null,
				editId 	 : res.body.editId,
				shareId  : res.body.shareId,
				version  : res.body.version
			},
			isSaving    : false,
			unsavedTime : new Date()
		}), ()=>{
			this.setState({ unsavedChanges : this.hasChanges() });
		});

		history.replaceState(null, null, `/edit/${this.savedBrew.editId}`);
	},

	renderGoogleDriveIcon : function(){
		return <Nav.item className='googleDriveStorage' onClick={this.handleGoogleClick}>
			<img src={googleDriveIcon} className={this.state.saveGoogle ? '' : 'inactive'} alt='Google Drive icon'/>

			{this.state.confirmGoogleTransfer &&
				<div className='errorContainer' onClick={this.closeAlerts}>
					{ this.state.saveGoogle
						?	`Would you like to transfer this brew from your Google Drive storage back to the Homebrewery?`
						: `Would you like to transfer this brew from the Homebrewery to your personal Google Drive storage?`
					}
					<br />
					<div className='confirm' onClick={this.toggleGoogleStorage}>
						Yes
					</div>
					<div className='deny'>
						No
					</div>
				</div>
			}

			{this.state.alertLoginToTransfer &&
				<div className='errorContainer' onClick={this.closeAlerts}>
					You must be signed in to a Google account to transfer
					between the homebrewery and Google Drive!
					<a target='_blank' rel='noopener noreferrer'
						href={`https://www.naturalcrit.com/login?redirect=${this.state.url}`}>
						<div className='confirm'>
							Sign In
						</div>
					</a>
					<div className='deny'>
						Not Now
					</div>
				</div>
			}

			{this.state.alertTrashedGoogleBrew &&
				<div className='errorContainer' onClick={this.closeAlerts}>
				This brew is currently in your Trash folder on Google Drive!<br />If you want to keep it, make sure to move it before it is deleted permanently!<br />
					<div className='confirm'>
						OK
					</div>
				</div>
			}
		</Nav.item>;
	},

	renderSaveButton : function(){

		// #1 - Currently saving, show SAVING
		if(this.state.isSaving){
			return <Nav.item className='save' icon='fas fa-spinner fa-spin'>saving...</Nav.item>;
		}

		// #2 - Unsaved changes exist, autosave is OFF and warning timer has expired, show AUTOSAVE WARNING
		if(this.state.unsavedChanges && this.state.autoSaveWarning){
			this.setAutosaveWarning();
			const elapsedTime = Math.round((new Date() - this.state.unsavedTime) / 1000 / 60);
			const text = elapsedTime == 0 ? 'Autosave is OFF.' : `Autosave is OFF, and you haven't saved for ${elapsedTime} minutes.`;

			return <Nav.item className='save error' icon='fas fa-exclamation-circle'>
			Reminder...
				<div className='errorContainer'>
					{text}
				</div>
			</Nav.item>;
		}

		// #3 - Unsaved changes exist, click to save, show SAVE NOW
		// Use trySave(true) instead of save() to use debounced save function
		if(this.state.unsavedChanges){
			return <Nav.item className='save' onClick={()=>this.trySave(true)} color='blue' icon='fas fa-save'>Save Now</Nav.item>;
		}
		// #4 - No unsaved changes, autosave is ON, show AUTO-SAVED
		if(this.state.autoSave){
			return <Nav.item className='save saved'>auto-saved.</Nav.item>;
		}
		// DEFAULT - No unsaved changes, show SAVED
		return <Nav.item className='save saved'>saved.</Nav.item>;
	},

	handleAutoSave : function(){
		if(this.warningTimer) clearTimeout(this.warningTimer);
		this.setState((prevState)=>({
			autoSave        : !prevState.autoSave,
			autoSaveWarning : prevState.autoSave
		}), ()=>{
			localStorage.setItem('AUTOSAVE_ON', JSON.stringify(this.state.autoSave));
		});
	},

	setAutosaveWarning : function(){
		setTimeout(()=>this.setState({ autoSaveWarning: false }), 4000);                           // 4 seconds to display
		this.warningTimer = setTimeout(()=>{this.setState({ autoSaveWarning: true });}, 900000);   // 15 minutes between warnings
		this.warningTimer;
	},

	errorReported : function(error) {
		this.setState({
			error
		});
	},

	renderAutoSaveButton : function(){
		return <Nav.item onClick={this.handleAutoSave}>
			Autosave <i className={this.state.autoSave ? 'fas fa-power-off active' : 'fas fa-power-off'}></i>
		</Nav.item>;
	},

	processShareId : function() {
		return this.state.brew.googleId && !this.state.brew.stubbed ?
					 this.state.brew.googleId + this.state.brew.shareId :
					 this.state.brew.shareId;
	},

	getRedditLink : function(){

		const shareLink = this.processShareId();
		const systems = this.props.brew.systems.length > 0 ? ` [${this.props.brew.systems.join(' - ')}]` : '';
		const title = `${this.props.brew.title} ${systems}`;
		const text = `Hey guys! I've been working on this homebrew. I'd love your feedback. Check it out.

**[Homebrewery Link](${global.config.baseUrl}/share/${shareLink})**`;

		return `https://www.reddit.com/r/UnearthedArcana/submit?title=${encodeURIComponent(title.toWellFormed())}&text=${encodeURIComponent(text)}`;
	},

	renderNavbar : function(){
		const shareLink = this.processShareId();

		return <Navbar>
			<Nav.section>
				<Nav.item className='brewTitle'>{this.state.brew.title}</Nav.item>
			</Nav.section>

			<Nav.section>
				{this.renderGoogleDriveIcon()}
				{this.state.error ?
					<ErrorNavItem error={this.state.error} parent={this}></ErrorNavItem> :
					<Nav.dropdown className='save-menu'>
						{this.renderSaveButton()}
						{this.renderAutoSaveButton()}
					</Nav.dropdown>
				}
				<NewBrew />
				<HelpNavItem/>
				<Nav.dropdown>
					<Nav.item color='teal' icon='fas fa-share-alt'>
						share
					</Nav.item>
					<Nav.item color='blue' href={`/share/${shareLink}`}>
						view
					</Nav.item>
					<Nav.item color='blue' onClick={()=>{navigator.clipboard.writeText(`${global.config.baseUrl}/share/${shareLink}`);}}>
						copy url
					</Nav.item>
					<Nav.item color='blue' href={this.getRedditLink()} newTab={true} rel='noopener noreferrer'>
						post to reddit
					</Nav.item>
				</Nav.dropdown>
				<PrintNavItem />
				<VaultNavItem />
				<RecentNavItem brew={this.state.brew} storageKey='edit' />
				<Account />
			</Nav.section>

		</Navbar>;
	},

	render : function(){
		return <div className='editPage sitePage'>
			<Meta name='robots' content='noindex, nofollow' />
			{this.renderNavbar()}

			{this.props.brew.lock && <LockNotification shareId={this.props.brew.shareId} message={this.props.brew.lock.editMessage} reviewRequested={this.props.brew.lock.reviewRequested} />}
			<div className='content'>
				<SplitPane onDragFinish={this.handleSplitMove}>
					<Editor
						ref={this.editor}
						brew={this.state.brew}
						onTextChange={this.handleTextChange}
						onStyleChange={this.handleStyleChange}
						onSnipChange={this.handleSnipChange}
						onMetaChange={this.handleMetaChange}
						reportError={this.errorReported}
						renderer={this.state.brew.renderer}
						userThemes={this.props.userThemes}
						themeBundle={this.state.themeBundle}
						updateBrew={this.updateBrew}
						onCursorPageChange={this.handleEditorCursorPageChange}
						onViewPageChange={this.handleEditorViewPageChange}
						currentEditorViewPageNum={this.state.currentEditorViewPageNum}
						currentEditorCursorPageNum={this.state.currentEditorCursorPageNum}
						currentBrewRendererPageNum={this.state.currentBrewRendererPageNum}
					/>
					<BrewRenderer
						text={this.state.brew.text}
						style={this.state.brew.style}
						renderer={this.state.brew.renderer}
						theme={this.state.brew.theme}
						themeBundle={this.state.themeBundle}
						errors={this.state.htmlErrors}
						lang={this.state.brew.lang}
						onPageChange={this.handleBrewRendererPageChange}
						currentEditorViewPageNum={this.state.currentEditorViewPageNum}
						currentEditorCursorPageNum={this.state.currentEditorCursorPageNum}
						currentBrewRendererPageNum={this.state.currentBrewRendererPageNum}
						allowPrint={true}
					/>
				</SplitPane>
			</div>
		</div>;
	}
});

module.exports = EditPage;
